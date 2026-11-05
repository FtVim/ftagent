import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TodoItem } from "./parse.ts";

export interface TodoCommandDescriptor {
    description: string;
    handler: (_args: unknown, ctx: ExtensionContext) => void;
}

export function render_todo_line(
    ctx: ExtensionContext,
    item: TodoItem,
): string {
    const { theme } = ctx.ui;
    const text =
        item.text.length > 60 ? `${item.text.slice(0, 57)}...` : item.text;
    if (item.completed) {
        return theme.fg("success", "☑ ") + theme.fg("muted", theme.strikethrough(text));
    }
    return `${theme.fg("muted", "☐ ")}${text}`;
}

export function update_todo_ui(
    items: readonly TodoItem[],
    ctx: ExtensionContext,
): void {
    if (!ctx.hasUI) {
        return;
    }
    if (items.length === 0) {
        ctx.ui.setStatus("todos", undefined);
        ctx.ui.setWidget("todos", undefined);
        return;
    }

    const completed = items.filter((item) => item.completed).length;
    ctx.ui.setStatus("todos", `todos ${completed}/${items.length}`);
    ctx.ui.setWidget("todos", items.map((item) => render_todo_line(ctx, item)));
}

export function create_todo_command(
    getItems: () => readonly TodoItem[],
): TodoCommandDescriptor {
    return {
        description: "Show current plan todo list",
        handler: (_args: unknown, ctx: ExtensionContext) => {
            if (!ctx.hasUI) {
                return;
            }
            const items = getItems();
            if (items.length === 0) {
                ctx.ui.notify("No todos. Create a plan first with /plan", "info");
                return;
            }
            const list = items
                .map((item, i) => `${i + 1}. ${item.completed ? "✓" : "○"} ${item.text}`)
                .join("\n");
            ctx.ui.notify(`Plan Progress:\n${list}`, "info");
        },
    };
}
