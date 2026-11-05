export const TODO_COUNT_MAX = 64;

export interface TodoItem {
    step: number;
    text: string;
    completed: boolean;
}

export interface TodosState {
    items: TodoItem[];
}

export function extract_todos(message: string): TodoItem[] {
    const headers = [...message.matchAll(/^\s*\*{0,2}Plan:\*{0,2}\s*$/gim)];
    const last_header = headers.at(-1);
    if (!last_header || last_header.index === undefined) {
        return [];
    }

    const section = message.slice(last_header.index + last_header[0].length);
    const items: TodoItem[] = [];
    for (const line of section.split("\n")) {
        const match = line.match(/^\s*\d+[.)]\s+(.+?)\s*$/);
        if (!match) {
            if (items.length > 0 && line.trim().length > 0) {
                break;
            }
            continue;
        }

        const marked_done = /^\[x\]\s*/i.test(match[1]);
        const text = match[1]
            .replace(/^\[x\]\s*/i, "")
            .replace(/\*{1,2}/g, "")
            .replace(/`/g, "")
            .trim();
        if (text.length > 0) {
            items.push({ step: items.length + 1, text, completed: marked_done });
        }
        if (items.length === TODO_COUNT_MAX) {
            break;
        }
    }
    return items;
}

export function mark_completed_todos(
    message: string,
    items: readonly TodoItem[],
): TodoItem[] {
    const completed_steps = new Set<number>();
    for (const match of message.matchAll(/\[DONE\s*:?\s*(\d+)\]/gi)) {
        completed_steps.add(Number(match[1]));
    }
    return items.map((item) => ({
        ...item,
        completed: item.completed || completed_steps.has(item.step),
    }));
}

export function is_todos_state(value: unknown): value is TodosState {
    if (typeof value !== "object" || value === null || !("items" in value)) {
        return false;
    }
    return Array.isArray(value.items) &&
        value.items.length <= TODO_COUNT_MAX &&
        value.items.every(is_todo_item);
}

function is_todo_item(value: unknown): value is TodoItem {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    return "step" in value &&
        typeof value.step === "number" &&
        Number.isSafeInteger(value.step) &&
        value.step > 0 &&
        "text" in value &&
        typeof value.text === "string" &&
        "completed" in value &&
        typeof value.completed === "boolean";
}
