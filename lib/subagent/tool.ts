import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import {
    CONFIG_DIR_NAME,
    type ExtensionContext,
    getAgentDir,
} from "@earendil-works/pi-coding-agent";
import * as path from "node:path";
import { type Static, Type } from "typebox";
import { type AgentConfig, type AgentScope, discover_agents } from "./agents.ts";
import { type AgentResult, run_agent } from "./runner.ts";

const MAX_PARALLEL_TASKS = 8;
const MAX_CONCURRENCY = 4;

const Task = Type.Object({
    agent: Type.String({ description: "Name of the agent to invoke" }),
    task: Type.String({ description: "Task to delegate" }),
    cwd: Type.Optional(Type.String({ description: "Working directory for this task" })),
});

const Parameters = Type.Object({
    agent: Type.Optional(Type.String({ description: "Agent name for a single task" })),
    task: Type.Optional(Type.String({ description: "Task for a single agent" })),
    tasks: Type.Optional(Type.Array(Task, { description: "Tasks to run in parallel" })),
    chain: Type.Optional(
        Type.Array(Task, {
            description: "Sequential tasks; {previous} is replaced with prior output",
        }),
    ),
    agentScope: Type.Optional(Type.Union([
        Type.Literal("user"),
        Type.Literal("project"),
        Type.Literal("both"),
    ], { description: "Agent sources to use. Defaults to user agents." })),
    cwd: Type.Optional(Type.String({ description: "Working directory for a single task" })),
});

type Parameters = Static<typeof Parameters>;
type Mode = "single" | "parallel" | "chain";
type Update = (result: AgentToolResult<SubagentDetails>) => void;

interface SubagentDetails {
    mode: Mode;
    results: AgentResult[];
    isError: boolean;
}

interface TaskRequest {
    agent: string;
    task: string;
    cwd?: string;
}

interface ResolvedTask {
    request: TaskRequest;
    cwd: string;
    agent?: AgentConfig;
    available_agents: AgentConfig[];
}

function failed_result(agent: string, task: string, error: string): AgentResult {
    return {
        agent,
        source: "unknown",
        task,
        status: "failed",
        output: "",
        stderr: "",
        error,
    };
}

function is_error(result: AgentResult): boolean {
    return result.status === "failed" || result.status === "aborted";
}

function details(mode: Mode, results: AgentResult[]): SubagentDetails {
    return { mode, results, isError: results.some(is_error) };
}

function output_text(result: AgentResult): string {
    const parts = [result.error, result.stderr.trim(), result.output.trim()]
        .filter((part): part is string => Boolean(part));
    return parts.join("\n\n") || "(no output)";
}

function resolve_tasks(
    requests: TaskRequest[],
    default_cwd: string,
    scope: AgentScope,
): ResolvedTask[] {
    return requests.map((request) => {
        const cwd = request.cwd ? path.resolve(default_cwd, request.cwd) : default_cwd;
        const discovery = discover_agents(cwd, scope);
        return {
            request,
            cwd,
            agent: discovery.agents.find((candidate) => candidate.name === request.agent),
            available_agents: discovery.agents,
        };
    });
}

function summarize_available_agents(tasks: ResolvedTask[]): string {
    const agents = new Map<string, AgentConfig["source"]>();
    for (const task of tasks) {
        for (const agent of task.available_agents) {
            agents.set(agent.name, agent.source);
        }
    }
    return Array.from(agents, ([name, source]) => `${name} (${source})`).join(", ") || "none";
}

function invalid_result(mode: Mode, tasks: ResolvedTask[], message: string) {
    return {
        content: [{
            type: "text" as const,
            text: `${message}\nAvailable agents: ${summarize_available_agents(tasks)}`,
        }],
        details: { mode, results: [], isError: true },
    };
}

function confirm_project_agents(
    tasks: ResolvedTask[],
    ctx: ExtensionContext,
): boolean | Promise<boolean> {
    const project_agents = new Map<string, AgentConfig>();
    for (const task of tasks) {
        if (task.agent?.source === "project") {
            project_agents.set(task.agent.file_path, task.agent);
        }
    }
    if (project_agents.size === 0) {
        return true;
    }
    if (!ctx.hasUI) {
        return false;
    }

    const sources = Array.from(project_agents.values())
        .map((agent) => `- ${agent.name}: ${agent.file_path}`)
        .join("\n");
    return ctx.ui.confirm(
        "Run project-local agents?",
        `These repository-controlled prompts can run tools:\n${sources}\n\nContinue only if you trust these files.`,
    );
}

function emit_update(
    mode: Mode,
    results: AgentResult[],
    on_update?: Update,
): void {
    on_update?.({
        content: [{ type: "text", text: results.map(output_text).join("\n\n") }],
        details: details(mode, results),
    });
}

async function map_with_concurrency<T>(
    items: T[],
    limit: number,
    run: (item: T, index: number) => Promise<void>,
): Promise<void> {
    let next_index = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next_index < items.length) {
            const index = next_index++;
            await run(items[index], index);
        }
    });
    await Promise.all(workers);
}

function unavailable_agent(task: ResolvedTask): AgentResult | undefined {
    if (task.agent) {
        return undefined;
    }
    const available = task.available_agents.map((agent) => `"${agent.name}"`).join(", ") ||
        "none";
    return failed_result(
        task.request.agent,
        task.request.task,
        `Unknown agent "${task.request.agent}". Available agents: ${available}.`,
    );
}

async function execute_tasks(
    mode: Mode,
    tasks: ResolvedTask[],
    ctx: ExtensionContext,
    signal: AbortSignal,
    on_update?: Update,
): Promise<AgentResult[]> {
    const defaults = {
        model: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined,
        thinking_level: ctx.thinkingLevel,
    };

    if (mode === "chain") {
        const results: AgentResult[] = [];
        let previous = "";
        for (const resolved of tasks) {
            const task = resolved.request.task.replace(/\{previous\}/g, previous);
            const current = unavailable_agent(resolved) ??
                await run_agent(resolved.agent, task, resolved.cwd, defaults, signal, (result) => {
                    emit_update(mode, [...results, result], on_update);
                });
            results.push(current);
            emit_update(mode, results, on_update);
            if (is_error(current)) {
                break;
            }
            previous = current.output;
        }
        return results;
    }

    if (mode === "single") {
        const resolved = tasks[0];
        const result = unavailable_agent(resolved) ??
            await run_agent(
                resolved.agent,
                resolved.request.task,
                resolved.cwd,
                defaults,
                signal,
                (current) => {
                    emit_update(mode, [current], on_update);
                },
            );
        emit_update(mode, [result], on_update);
        return [result];
    }

    const results: AgentResult[] = tasks.map((task) => ({
        agent: task.request.agent,
        source: task.agent?.source ?? "unknown",
        task: task.request.task,
        status: "pending",
        output: "",
        stderr: "",
    }));
    await map_with_concurrency(tasks, MAX_CONCURRENCY, async (resolved, index) => {
        results[index] = unavailable_agent(resolved) ??
            await run_agent(
                resolved.agent,
                resolved.request.task,
                resolved.cwd,
                defaults,
                signal,
                (current) => {
                    results[index] = current;
                    emit_update(mode, results, on_update);
                },
            );
        emit_update(mode, results, on_update);
    });
    return results;
}

export function create_subagent_tool() {
    return {
        name: "subagent",
        label: "Subagent",
        description: [
            "Delegate work to isolated Pi agents.",
            "Use agent + task for one agent, tasks for parallel work, or chain for sequential work.",
            `User agents are discovered in ${path.join(getAgentDir(), "agents")}.`,
            `Project agents in ${CONFIG_DIR_NAME}/agents require agentScope and interactive approval.`,
        ].join(" "),
        parameters: Parameters,
        async execute(
            _tool_call_id: string,
            params: Parameters,
            signal: AbortSignal,
            on_update: Update,
            ctx: ExtensionContext,
        ) {
            const has_single = Boolean(params.agent && params.task);
            const has_parallel = Boolean(params.tasks?.length);
            const has_chain = Boolean(params.chain?.length);
            const mode_count = Number(has_single) + Number(has_parallel) + Number(has_chain);
            const mode: Mode = has_chain ? "chain" : has_parallel ? "parallel" : "single";
            let requests: TaskRequest[];
            if (has_single && params.agent && params.task) {
                requests = [{ agent: params.agent, task: params.task, cwd: params.cwd }];
            } else {
                requests = params.tasks ?? params.chain ?? [];
            }
            const scope = params.agentScope ?? "user";
            if (mode_count !== 1 || requests.length === 0) {
                const available = discover_agents(ctx.cwd, scope).agents
                    .map((agent) => `${agent.name} (${agent.source})`)
                    .join(", ") || "none";
                return {
                    content: [{
                        type: "text" as const,
                        text:
                            `Provide exactly one non-empty subagent mode.\nAvailable agents: ${available}`,
                    }],
                    details: { mode, results: [], isError: true },
                };
            }
            const resolved = resolve_tasks(requests, ctx.cwd, scope);

            if (resolved.some((task) => !task.request.agent.trim() || !task.request.task.trim())) {
                return invalid_result(
                    mode,
                    resolved,
                    "Each task needs a non-empty agent and task.",
                );
            }
            if (mode === "parallel" && requests.length > MAX_PARALLEL_TASKS) {
                return invalid_result(
                    mode,
                    resolved,
                    `Too many parallel tasks (${requests.length}); the maximum is ${MAX_PARALLEL_TASKS}.`,
                );
            }

            if (!await confirm_project_agents(resolved, ctx)) {
                const message = ctx.hasUI
                    ? "Project-local agents were not approved."
                    : "Project-local agents require an interactive confirmation.";
                return {
                    content: [{ type: "text" as const, text: message }],
                    details: { mode, results: [], isError: !ctx.hasUI },
                };
            }

            const results = await execute_tasks(mode, resolved, ctx, signal, on_update);
            const error = results.some(is_error);
            const text = mode === "parallel"
                ? `Parallel: ${
                    results.filter((result) => !is_error(result)).length
                }/${results.length} succeeded\n\n${
                    results.map((result) =>
                        `### ${result.agent} (${result.status})\n\n${output_text(result)}`
                    )
                        .join("\n\n")
                }`
                : mode === "chain" && error
                ? `Chain stopped after ${results.length} step(s).\n\n${
                    output_text(results[results.length - 1])
                }`
                : output_text(results[results.length - 1]);
            const result: AgentToolResult<SubagentDetails> = {
                content: [{ type: "text", text }],
                details: details(mode, results),
            };
            return result;
        },
    };
}
