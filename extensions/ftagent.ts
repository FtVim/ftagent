import type {
    ExtensionAPI,
    ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { render_banner } from "../lib/banner.ts";
import { PromptEditor } from "../lib/editor/prompt.ts";

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

export default function ftagent_extension(pi: ExtensionAPI): void {
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
