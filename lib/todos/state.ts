import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import {
    extract_todos,
    is_todos_state,
    mark_completed_todos,
    type TodoItem,
} from "./parse.ts";

function is_assistant_message(message: AgentMessage): message is AssistantMessage {
    return message.role === "assistant" && Array.isArray(message.content);
}

function assistant_text(message: AssistantMessage): string {
    return message.content
        .map((block) => {
            if (block.type === "text") {
                return block.text;
            }
            if (block.type === "thinking" && "thinking" in block) {
                return typeof block.thinking === "string" ? block.thinking : "";
            }
            return "";
        })
        .join("\n");
}

export function update_todos_from_messages(
    messages: readonly AgentMessage[],
    current: readonly TodoItem[],
): TodoItem[] | undefined {
    const message = [...messages].reverse().find(is_assistant_message);
    if (!message) {
        return undefined;
    }

    const text = assistant_text(message);
    const extracted = extract_todos(text);
    const updated = extracted.length > 0
        ? mark_completed_todos(text, extracted)
        : mark_completed_todos(text, current);
    const changed = updated.length !== current.length ||
        updated.some((item, index) => {
            const previous = current[index];
            return !previous ||
                item.completed !== previous.completed ||
                item.text !== previous.text;
        });
    return changed ? updated : undefined;
}

export function create_todos_context(
    message_type: string,
    prompt: string | undefined,
    items: readonly TodoItem[],
): { message: { customType: string; content: string; display: false } } | undefined {
    if (message_type !== "user" || !prompt?.includes("<!-- ftagent:todos -->")) {
        return undefined;
    }
    const todos = items.length === 0
        ? "No saved todos."
        : items.map((item) =>
            `${item.completed ? "[x]" : "[ ]"} ${item.step}. ${item.text}`
        ).join("\n");
    return {
        message: {
            customType: "ftagent-plan-todos",
            display: false,
            content: `Persisted plan todos:\n${todos}`,
        },
    };
}

export function restore_todos(entries: readonly unknown[]): TodoItem[] {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if (typeof entry !== "object" || entry === null || !("customType" in entry)) {
            continue;
        }
        if (entry.customType !== "ftagent-todos" || !("data" in entry)) {
            continue;
        }
        if (is_todos_state(entry.data)) {
            return entry.data.items;
        }
        return [];
    }
    return [];
}
