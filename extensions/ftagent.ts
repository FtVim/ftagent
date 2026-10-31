import type {
    ExtensionAPI,
    ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { PromptEditor } from "../lib/editor/prompt.ts";

function activate_theme(ctx: ExtensionContext): void {
    const theme = ctx.ui.getTheme("ftagent");
    if (theme === undefined) {
        ctx.ui.notify(
            "ftagent theme is not installed; keeping the current theme.",
            "warning",
        );
        return;
    }

    const result = ctx.ui.setTheme("ftagent");
    if (!result.success) {
        ctx.ui.notify(
            `ftagent theme failed to activate: ${result.error ?? "unknown error"}`,
            "error",
        );
    }
}

export function install_prompt_editor(ctx: ExtensionContext): void {
    ctx.ui.setEditorComponent(
        (tui, theme, keybindings) =>
            new PromptEditor(
                tui,
                theme,
                keybindings,
                (text) => ctx.ui.theme.fg("accent", text),
                (message) => ctx.ui.notify(message, "warning"),
            ),
    );
}

export default function ftagent_extension(pi: ExtensionAPI): void {
    pi.on("session_start", (_event, ctx) => {
        if (!ctx.hasUI) {
            return;
        }
        if (ctx.mode !== "tui") {
            return;
        }

        activate_theme(ctx);
        install_prompt_editor(ctx);
    });
}
