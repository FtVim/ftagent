import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentConfig } from "./agents.ts";

export type AgentStatus = "pending" | "running" | "completed" | "failed" | "aborted";

export interface AgentResult {
    agent: string;
    source: AgentConfig["source"] | "unknown";
    task: string;
    status: AgentStatus;
    output: string;
    stderr: string;
    error?: string;
    stop_reason?: string;
}

interface DispatchDefaults {
    model?: string;
    thinking_level?: string;
}

type UpdateCallback = (result: AgentResult) => void;

interface ProcessOutcome {
    code: number | null;
    signal: NodeJS.Signals | null;
    error?: Error;
    aborted: boolean;
}

function pi_invocation(args: string[]): { command: string; args: string[] } {
    const script = process.argv[1];
    if (script && !script.startsWith("/$bunfs/root/") && fs.existsSync(script)) {
        return { command: process.execPath, args: [script, ...args] };
    }

    const runtime = path.basename(process.execPath).toLowerCase();
    if (/^(node|bun)(\.exe)?$/.test(runtime)) {
        return { command: "pi", args };
    }
    return { command: process.execPath, args };
}

async function write_system_prompt(
    agent: AgentConfig,
): Promise<{ directory: string; file: string }> {
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ftagent-subagent-"));
    const name = agent.name.replace(/[^\w.-]+/g, "_");
    const file = path.join(directory, `${name}.md`);
    try {
        await fs.promises.writeFile(file, agent.system_prompt, { encoding: "utf8", mode: 0o600 });
        return { directory, file };
    } catch (error) {
        await fs.promises.rm(directory, { recursive: true, force: true });
        throw error;
    }
}

function assistant_message(
    line: string,
): { text: string; stop_reason?: string; error_message?: string } | undefined {
    let event: unknown;
    try {
        event = JSON.parse(line);
    } catch {
        return undefined;
    }
    if (
        typeof event !== "object" || event === null || !("type" in event) ||
        event.type !== "message_end"
    ) {
        return undefined;
    }
    if (!("message" in event) || typeof event.message !== "object" || event.message === null) {
        return undefined;
    }
    const message = event.message;
    if (!("role" in message) || message.role !== "assistant" || !("content" in message)) {
        return undefined;
    }
    if (!Array.isArray(message.content)) {
        return undefined;
    }
    const text = message.content
        .filter((part): part is { type: "text"; text: string } =>
            typeof part === "object" &&
            part !== null &&
            "type" in part &&
            part.type === "text" &&
            "text" in part &&
            typeof part.text === "string"
        )
        .map((part) => part.text)
        .join("");
    return {
        text,
        stop_reason: "stopReason" in message && typeof message.stopReason === "string"
            ? message.stopReason
            : undefined,
        error_message: "errorMessage" in message && typeof message.errorMessage === "string"
            ? message.errorMessage
            : undefined,
    };
}

export async function run_agent(
    agent: AgentConfig | undefined,
    task: string,
    cwd: string,
    defaults: DispatchDefaults,
    signal?: AbortSignal,
    on_update?: UpdateCallback,
): Promise<AgentResult> {
    const result: AgentResult = {
        agent: agent?.name ?? "unknown",
        source: agent?.source ?? "unknown",
        task,
        status: "running",
        output: "",
        stderr: "",
    };
    if (!agent) {
        result.status = "failed";
        result.error = "Agent definition was not found.";
        return result;
    }
    if (signal?.aborted) {
        result.status = "aborted";
        result.error = "Subagent was aborted before starting.";
        return result;
    }

    const args = ["--mode", "json", "-p", "--no-session"];
    const model = agent.model ?? defaults.model;
    if (model) {
        args.push("--model", model);
    }
    if (!agent.model && defaults.thinking_level) {
        args.push("--thinking", defaults.thinking_level);
    }
    if (agent.tools?.length) {
        args.push("--tools", agent.tools.join(","));
    }

    let prompt_directory: string | undefined;
    try {
        if (agent.system_prompt.trim().length > 0) {
            const prompt = await write_system_prompt(agent);
            prompt_directory = prompt.directory;
            args.push("--append-system-prompt", prompt.file);
        }
        args.push(`Task: ${task}`);
        on_update?.(result);

        let aborted = false;
        const outcome = await new Promise<ProcessOutcome>((resolve) => {
            const invocation = pi_invocation(args);
            let child: ReturnType<typeof spawn>;
            let settled = false;
            let kill_timer: ReturnType<typeof setTimeout> | undefined;

            const finish = (outcome: ProcessOutcome) => {
                if (settled) {
                    return;
                }
                settled = true;
                if (kill_timer) {
                    clearTimeout(kill_timer);
                }
                signal?.removeEventListener("abort", abort_child);
                resolve(outcome);
            };
            const abort_child = () => {
                if (!child.kill("SIGTERM")) {
                    return;
                }
                aborted = true;
                kill_timer = setTimeout(() => {
                    child.kill("SIGKILL");
                }, 5000);
            };

            try {
                child = spawn(invocation.command, invocation.args, {
                    cwd,
                    shell: false,
                    stdio: ["ignore", "pipe", "pipe"],
                });
            } catch (error) {
                finish({
                    code: null,
                    signal: null,
                    error: error instanceof Error ? error : new Error(String(error)),
                    aborted: false,
                });
                return;
            }

            let buffer = "";
            child.stdout?.on("data", (chunk: Buffer) => {
                buffer += chunk.toString();
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";
                for (const line of lines) {
                    const message = assistant_message(line);
                    if (message) {
                        if (message.text.length > 0) {
                            result.output = message.text;
                        }
                        result.stop_reason = message.stop_reason ?? result.stop_reason;
                        result.error = message.error_message ?? result.error;
                        on_update?.(result);
                    }
                }
            });
            child.stderr?.on("data", (chunk: Buffer) => {
                result.stderr += chunk.toString();
            });
            child.on("error", (error) => {
                finish({ code: null, signal: null, error, aborted });
            });
            child.on("close", (code, child_signal) => {
                if (buffer.trim().length > 0) {
                    const message = assistant_message(buffer);
                    if (message) {
                        if (message.text.length > 0) {
                            result.output = message.text;
                        }
                        result.stop_reason = message.stop_reason ?? result.stop_reason;
                        result.error = message.error_message ?? result.error;
                        on_update?.(result);
                    }
                }
                finish({ code, signal: child_signal, aborted });
            });

            if (signal?.aborted) {
                abort_child();
            } else {
                signal?.addEventListener("abort", abort_child, { once: true });
            }
        });

        if (outcome.aborted) {
            result.status = "aborted";
            result.error = "Subagent was aborted.";
        } else if (outcome.error) {
            result.status = "failed";
            result.error = `Could not start subagent: ${outcome.error.message}`;
        } else if (outcome.signal) {
            result.status = "failed";
            result.error = `Subagent terminated by signal ${outcome.signal}.`;
        } else if (outcome.code !== 0) {
            result.status = "failed";
            result.error = `Subagent exited with code ${outcome.code}.`;
        } else if (result.stop_reason === "error") {
            result.status = "failed";
            result.error ??= "Subagent reported an error.";
        } else if (result.stop_reason === "aborted") {
            result.status = "aborted";
            result.error ??= "Subagent was aborted.";
        } else {
            result.status = "completed";
        }
    } catch (error) {
        result.status = "failed";
        result.error = error instanceof Error ? error.message : String(error);
    } finally {
        if (prompt_directory) {
            await fs.promises.rm(prompt_directory, { recursive: true, force: true });
        }
    }

    return result;
}
