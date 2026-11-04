import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { resolve, sep } from "node:path";

const PATH_LENGTH_MAX = 4096;
const PROTECTED_DIRECTORY_SEQUENCES: readonly (readonly string[])[] = [
    [".git"],
    ["node_modules"],
    [".config", "git"],
    [".ssh"],
    [".cargo"],
    [".devcontainer"],
    [".yarn"],
    [".mvn"],
    [".pi"],
];
const PROTECTED_FILE_NAMES = new Set([
    ".gitconfig",
    ".gitmodules",
    ".bashrc",
    ".bash_profile",
    ".bash_login",
    ".bash_aliases",
    ".bash_logout",
    ".zshrc",
    ".zprofile",
    ".zshenv",
    ".zlogin",
    ".zlogout",
    ".profile",
    ".envrc",
    ".npmrc",
    ".yarnrc",
    ".yarnrc.yml",
    ".pnp.cjs",
    ".pnp.loader.mjs",
    ".pnpmfile.cjs",
    "bunfig.toml",
    ".bunfig.toml",
    ".bazelrc",
    ".bazelversion",
    ".bazeliskrc",
    ".pre-commit-config.yaml",
    "lefthook.yml",
    "lefthook.yaml",
    ".lefthook.yml",
    ".lefthook.yaml",
    "gradle-wrapper.properties",
    "maven-wrapper.properties",
    ".devcontainer.json",
    ".ripgreprc",
    "pyrightconfig.json",
    ".mcp.json",
    "remote-settings.json",
    "id_rsa",
    "id_ed25519",
    "credentials",
]);
const PROTECTED_FILE_PREFIXES = [".env"] as const;
const PROTECTED_FILE_SUFFIXES = [".pem"] as const;

function basename(segments: readonly string[]): string {
    return segments.at(-1) ?? "";
}

function contains_sequence(
    segments: readonly string[],
    sequence: readonly string[],
): boolean {
    if (sequence.length === 0 || sequence.length > segments.length) {
        return false;
    }
    for (
        let start = 0;
        start <= segments.length - sequence.length;
        start += 1
    ) {
        let matches = true;
        for (let offset = 0; offset < sequence.length; offset += 1) {
            if (segments[start + offset] !== sequence[offset]) {
                matches = false;
                break;
            }
        }
        if (matches) {
            return true;
        }
    }
    return false;
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
    for (const sequence of PROTECTED_DIRECTORY_SEQUENCES) {
        if (contains_sequence(segments, sequence)) {
            return sequence.join("/");
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

    if (ctx.hasUI) {
        ctx.ui.notify(`Blocked write to protected path: ${path}`, "warning");
    }
    return {
        block: true,
        reason: `Path "${path}" is protected (${rule})`,
    };
}
