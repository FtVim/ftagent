import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

// These are heuristics for common destructive commands, not a sandbox.
const COMMAND_LENGTH_MAX = 64 * 1024;

export const DANGEROUS_COMMAND_PATTERNS = [
    /\brm\s+(-rf?|--recursive)/i,
    /\bsudo\b/i,
    /\b(chmod|chown)\b.*777/i,
] as const;

export function is_dangerous_command(command: string): boolean {
    if (typeof command !== "string") {
        throw new Error("ftagent: dangerous command check requires a string");
    }
    if (command.length > COMMAND_LENGTH_MAX) {
        throw new Error("ftagent: command exceeds the length limit");
    }
    return DANGEROUS_COMMAND_PATTERNS.some((pattern) => pattern.test(command));
}

export async function check_permission_gate(
    command: string | undefined,
    ctx: ExtensionContext,
): Promise<{ block: true; reason: string } | undefined> {
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
}
