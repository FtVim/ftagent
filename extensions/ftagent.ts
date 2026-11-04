import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { render_banner } from "../lib/banner.ts";
import { PromptEditor } from "../lib/editor/prompt.ts";
import { auto_commit_on_shutdown } from "../lib/git/auto_commit.ts";
import { check_path_protection } from "../lib/guard/path_protection.ts";
import { check_permission_gate } from "../lib/guard/permission_gate.ts";

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
        render: (width) => render_banner(theme, width),
        invalidate() {},
    }));
}

export function install_prompt_editor(
    pi: ExtensionAPI,
    ctx: ExtensionContext,
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
            void pi.exec("git", ["-C", ctx.cwd, "branch", "--show-current"])
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
    pi.on("session_shutdown", (_event, ctx) => auto_commit_on_shutdown(pi, ctx));
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
        if (!ctx.hasUI) {
            return;
        }
        if (ctx.mode !== "tui") {
            return;
        }

        install_banner(ctx);
        install_prompt_editor(pi, ctx);
    });
}
