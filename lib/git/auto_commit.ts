import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const COMMIT_SUBJECT_LENGTH_MAX = 72;
const SESSION_ENTRY_SCAN_MAX = 4096;
const MESSAGE_CONTENT_SCAN_MAX = 256;
const CONVENTIONAL_COMMIT_PREFIX = /^[a-z][a-z0-9-]*(?:\([a-z0-9./_-]+\))?!?:\s+\S/;

function read_record(value: unknown): Record<string, unknown> | undefined {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return undefined;
    }
    return value as Record<string, unknown>;
}

function last_assistant_summary(entries: unknown): string {
    if (!Array.isArray(entries)) {
        return "";
    }

    const first_index = Math.max(0, entries.length - SESSION_ENTRY_SCAN_MAX);
    for (let index = entries.length - 1; index >= first_index; index -= 1) {
        const entry = read_record(entries[index]);
        if (entry?.type !== "message") {
            continue;
        }

        const message = read_record(entry.message);
        if (message?.role !== "assistant") {
            continue;
        }

        if (typeof message.content === "string") {
            return message.content;
        }
        if (!Array.isArray(message.content)) {
            return "";
        }

        const text_chunks: string[] = [];
        const content_count = Math.min(
            message.content.length,
            MESSAGE_CONTENT_SCAN_MAX,
        );
        for (let index = 0; index < content_count; index += 1) {
            const raw_content = message.content[index];
            const content = read_record(raw_content);
            if (content?.type !== "text") {
                continue;
            }
            if (typeof content.text !== "string") {
                continue;
            }
            text_chunks.push(content.text);
        }
        return text_chunks.join("\n");
    }

    return "";
}

function commit_message(summary: string): string {
    const first_line = summary.split(/\r?\n/u, 1)[0]
        ?.replace(/\s+/gu, " ")
        .trim() ?? "";
    const subject = first_line || "work in progress";
    const conventional_subject = CONVENTIONAL_COMMIT_PREFIX.test(subject)
        ? subject
        : `chore: ${subject}`;
    return conventional_subject.slice(0, COMMIT_SUBJECT_LENGTH_MAX);
}

function report_failure(ctx: ExtensionContext, message: string): void {
    if (ctx.hasUI) {
        ctx.ui.notify(message, "warning");
        return;
    }
    throw new Error(message);
}

function run_git(
    pi: ExtensionAPI,
    ctx: ExtensionContext,
    args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
    return pi.exec("git", ["-C", ctx.cwd, ...args]);
}

export async function auto_commit_on_shutdown(
    pi: ExtensionAPI,
    ctx: ExtensionContext,
): Promise<void> {
    const status = await run_git(pi, ctx, ["status", "--porcelain"]);
    if (status.code !== 0) {
        report_failure(ctx, `Auto-commit could not read git status: ${status.stderr}`);
        return;
    }
    if (status.stdout.trim().length === 0) {
        return;
    }

    const summary = last_assistant_summary(ctx.sessionManager.getEntries());
    const message = commit_message(summary);
    const stage = await run_git(pi, ctx, ["add", "-A"]);
    if (stage.code !== 0) {
        report_failure(ctx, `Auto-commit could not stage changes: ${stage.stderr}`);
        return;
    }

    const commit = await run_git(pi, ctx, ["commit", "-m", message]);
    if (commit.code !== 0) {
        report_failure(ctx, `Auto-commit failed: ${commit.stderr}`);
        return;
    }

    if (ctx.hasUI) {
        ctx.ui.notify(`Auto-committed: ${message}`, "info");
    }
}
