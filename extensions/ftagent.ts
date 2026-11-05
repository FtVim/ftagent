import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { PromptEditor } from "../lib/editor/index.ts";
import { GitCheckpoints } from "../lib/git/index.ts";
import { check_path_protection, check_permission_gate } from "../lib/guard/index.ts";
import { render_header } from "../lib/header/index.ts";
import { create_subagent_tool } from "../lib/subagent/index.ts";
import {
    create_todos_context,
    create_todo_command,
    restore_todos,
    update_todo_ui,
    update_todos_from_messages,
    type TodoItem,
} from "../lib/todos/index.ts";

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
    let todo_items: TodoItem[] = [];
    pi.registerTool(create_subagent_tool());
    pi.registerCommand("todos", create_todo_command(() => todo_items));
    pi.on("session_start", (_event, ctx) => {
        todo_items = restore_todos(ctx.sessionManager.getEntries());
        update_todo_ui(todo_items, ctx);

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
    pi.on("before_agent_start", (event) =>
        create_todos_context(event.messageType, event.prompt, todo_items)
    );
    pi.on("turn_start", (_event, ctx) => git_checkpoints.capture(ctx, pi.exec));
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
    pi.on("agent_end", (event, ctx) => {
        const updated = update_todos_from_messages(event.messages, todo_items);
        if (!updated) {
            return;
        }
        todo_items = updated;
        pi.appendEntry("ftagent-todos", {
            items: todo_items.map((item) => ({ ...item })),
        });
        update_todo_ui(todo_items, ctx);
    });
    pi.on("agent_settled", () => git_checkpoints.clear());
    pi.on("session_before_fork", (event, ctx) =>
        git_checkpoints.restore(event.entryId, ctx, pi.exec)
    );
}
