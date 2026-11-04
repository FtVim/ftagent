import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { PromptEditor } from "../lib/editor/index.ts";
import { auto_commit_on_shutdown, GitCheckpoints } from "../lib/git/index.ts";
import { check_path_protection, check_permission_gate } from "../lib/guard/index.ts";
import { render_header } from "../lib/header/index.ts";
import { create_subagent_tool } from "../lib/subagent/index.ts";

function read_string_field(
    input: unknown,
    field: string,
): string | undefined {
    if (typeof field !== "string" || field.length === 0) {
        throw new Error("ftagent: field name must be a non-empty string");
    }
    if (typeof input !== "object" || input === null) {
        return undefined;
    }

    const value = (input as Record<string, unknown>)[field];
    return typeof value === "string" ? value : undefined;
}

export function install_banner(ctx: ExtensionContext): void {
    ctx.ui.setHeader((_tui, theme) => ({
        render: (width) => render_header(theme, width),
        invalidate() {},
    }));
}

export function install_prompt_editor(
    ctx: ExtensionContext,
    exec: ExtensionAPI["exec"],
): void {
    ctx.ui.setEditorComponent(
        (tui, theme, keybindings) => {
            const editor = new PromptEditor(
                tui,
                theme,
                keybindings,
                ctx,
                (message) => ctx.ui.notify(message, "warning"),
            );
            void exec("git", ["-C", ctx.cwd, "branch", "--show-current"])
                .then(({ stdout, code }) => {
                    if (code === 0) {
                        editor.set_git_branch(stdout.trim() || undefined);
                    }
                })
                .catch(() => {
                    ctx.ui.notify("Could not read the Git branch", "warning");
                });
            return editor;
        },
    );
}

export default function ftagent_extension(pi: ExtensionAPI): void {
    const git_checkpoints = new GitCheckpoints();
    pi.registerTool(create_subagent_tool());
    pi.on("session_shutdown", (_event, ctx) => auto_commit_on_shutdown(ctx, pi.exec));
    pi.on("turn_start", (_event, ctx) => git_checkpoints.capture(ctx, pi.exec));
    pi.on(
        "session_before_fork",
        (event, ctx) => git_checkpoints.restore(event.entryId, ctx, pi.exec),
    );
    pi.on("tool_result", (event, ctx) => {
        git_checkpoints.track_current_entry(ctx);
        if (event.toolName !== "subagent") {
            return undefined;
        }
        if (
            typeof event.details === "object" &&
            event.details !== null &&
            "isError" in event.details &&
            event.details.isError === true
        ) {
            return { isError: true };
        }
        return undefined;
    });
    pi.on("agent_settled", () => {
        git_checkpoints.clear();
    });
    pi.on("tool_call", (event, ctx) => {
        if (event.toolName === "write" || event.toolName === "edit") {
            const path = read_string_field(event.input, "path");
            return check_path_protection(path, ctx);
        }

        if (event.toolName === "bash") {
            const command = read_string_field(event.input, "command");
            return check_permission_gate(command, ctx);
        }

        return undefined;
    });
    pi.on("session_start", (_event, ctx) => {
        git_checkpoints.clear();
        if (!ctx.hasUI) {
            return;
        }
        if (ctx.mode !== "tui") {
            return;
        }

        install_banner(ctx);
        install_prompt_editor(ctx, pi.exec);
    });
}
