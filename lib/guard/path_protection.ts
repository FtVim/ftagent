import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { resolve, sep } from "node:path";

const PATH_LENGTH_MAX = 4096;
const PROTECTED_DIRECTORY_SEGMENTS = new Set([".git", "node_modules", ".ssh"]);
const PROTECTED_FILE_NAMES = new Set(["id_rsa", "id_ed25519", "credentials"]);
const PROTECTED_FILE_PREFIXES = [".env"] as const;
const PROTECTED_FILE_SUFFIXES = [".pem"] as const;

function basename(segments: readonly string[]): string {
    return segments.at(-1) ?? "";
}

export function find_protected_rule(
    path: string,
    cwd: string,
): string | undefined {
    if (typeof path !== "string" || path.length === 0) {
        throw new Error("ftagent: protected path check requires a path");
    }
    if (typeof cwd !== "string" || cwd.length === 0) {
        throw new Error("ftagent: protected path check requires a cwd");
    }
    if (path.length > PATH_LENGTH_MAX || cwd.length > PATH_LENGTH_MAX) {
        throw new Error("ftagent: path exceeds the length limit");
    }

    // Lexical resolution keeps the check independent of the filesystem, so it also
    // covers files a write is about to create. Symlink targets are not inspected.
    const segments = resolve(cwd, path).split(sep);
    for (const segment of segments) {
        if (PROTECTED_DIRECTORY_SEGMENTS.has(segment)) {
            return segment;
        }
    }

    const name = basename(segments);
    if (PROTECTED_FILE_NAMES.has(name)) {
        return name;
    }
    for (const prefix of PROTECTED_FILE_PREFIXES) {
        if (name.startsWith(prefix)) {
            return prefix;
        }
    }
    for (const suffix of PROTECTED_FILE_SUFFIXES) {
        if (name.endsWith(suffix)) {
            return suffix;
        }
    }
    return undefined;
}

export function check_path_protection(
    path: string | undefined,
    ctx: ExtensionContext,
): { block: true; reason: string } | undefined {
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
}
