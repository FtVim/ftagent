import type {
    ExtensionAPI,
    ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { render_banner } from "../lib/banner.ts";
import { PromptEditor } from "../lib/editor/prompt.ts";
import { find_protected_rule } from "../lib/guard/path_protection.ts";
import { is_dangerous_command } from "../lib/guard/permission_gate.ts";

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

export function install_prompt_editor(ctx: ExtensionContext): void {
    ctx.ui.setEditorComponent(
        (tui, theme, keybindings) =>
            new PromptEditor(
                tui,
                theme,
                keybindings,
                (message) => ctx.ui.notify(message, "warning"),
            ),
    );
}

export function install_permission_gate(pi: ExtensionAPI): void {
    pi.on("tool_call", async (event, ctx) => {
        if (event.toolName !== "bash") {
            return undefined;
        }

        const command = read_string_field(event.input, "command");
        if (command === undefined) {
            return {
                block: true,
                reason: "Dangerous command blocked (invalid command input)",
            };
        }
        if (!is_dangerous_command(command)) {
            return undefined;
        }

        // Fail closed until a non-interactive policy exists.
        if (!ctx.hasUI) {
            return {
                block: true,
                reason: "Dangerous command blocked (no UI for confirmation)",
            };
        }

        const choice = await ctx.ui.select(
            `⚠️ Dangerous command:\n\n  ${command}\n\nAllow?`,
            ["Yes", "No"],
        );
        if (choice !== "Yes") {
            return { block: true, reason: "Blocked by user" };
        }
        return undefined;
    });
}

export function install_path_protection(pi: ExtensionAPI): void {
    pi.on("tool_call", (event, ctx) => {
        if (event.toolName !== "write" && event.toolName !== "edit") {
            return undefined;
        }

        const path = read_string_field(event.input, "path");
        if (path === undefined || path.length === 0) {
            return {
                block: true,
                reason: "Path protection could not read the target path",
            };
        }

        const rule = find_protected_rule(path, ctx.cwd);
        if (rule === undefined) {
            return undefined;
        }

        // The block is unconditional; only the notification needs a UI.
        if (ctx.hasUI) {
            ctx.ui.notify(`Blocked write to protected path: ${path}`, "warning");
        }
        return {
            block: true,
            reason: `Path "${path}" is protected (${rule})`,
        };
    });
}

export default function ftagent_extension(pi: ExtensionAPI): void {
    install_permission_gate(pi);
    install_path_protection(pi);

    pi.on("session_start", (_event, ctx) => {
        if (!ctx.hasUI) {
            return;
        }
        if (ctx.mode !== "tui") {
            return;
        }

        install_banner(ctx);
        install_prompt_editor(ctx);
    });
}
