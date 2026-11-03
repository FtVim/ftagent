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
