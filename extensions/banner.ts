import type {
    ExtensionAPI,
    ExtensionContext,
    Theme,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const TEXT_LOGO = [
    "▄▄  ▄                   ▄",
    "█▄  ▀█▀ ▀▀▄ ▄▀█ ▄▀█ █■█ ▀█▀",
    "█    █  █▄█ ▀▄█ █▄▄ █ █  █",
    "▀            ▄▀",
] as const;

// Center the whole block so short rows keep their alignment with the art.
const LOGO_WIDTH = Math.max(...TEXT_LOGO.map((line) => visibleWidth(line)));

type ThemeRole = Parameters<Theme["fg"]>[0];

// Colors come from the active theme, so the banner works without ftagent's theme.
const GLYPH_ROLES: Partial<Record<string, ThemeRole>> = {
    "█": "accent",
    "▄": "accent",
    "▀": "accent",
    "■": "text",
};

function assert(condition: boolean, message: string): asserts condition {
    if (!condition) {
        throw new Error(`ftagent: ${message}`);
    }
}

function paint_line(theme: Theme, line: string): string {
    assert(line.length <= 256, "banner line exceeds 256 cells");
    let painted = "";
    let run = "";
    let run_role: ThemeRole | undefined;

    for (const char of line) {
        const role = GLYPH_ROLES[char];
        if (role === run_role) {
            run += char;
            continue;
        }
        if (run !== "") {
            painted += run_role === undefined ? run : theme.fg(run_role, run);
        }
        run = char;
        run_role = role;
    }
    if (run !== "") {
        painted += run_role === undefined ? run : theme.fg(run_role, run);
    }
    // Coloring must not move any glyph; centered art depends on exact widths.
    assert(visibleWidth(painted) === visibleWidth(line), "paint changed visible width");
    return painted;
}

function center_line(line: string, width: number): string {
    assert(Number.isInteger(width), "center width must be an integer");
    assert(width >= 0, "center width must be non-negative");
    const line_width = visibleWidth(line);
    if (line_width >= width) {
        return truncateToWidth(line, width, "");
    }
    const padding = Math.floor((width - line_width) / 2);
    return " ".repeat(padding) + line;
}

export function render_banner(theme: Theme, width: number): string[] {
    assert(Number.isInteger(width), "render width must be an integer");
    assert(width >= 0, "render width must be non-negative");
    assert(width <= 4096, "render width exceeds 4096 columns");
    assert(TEXT_LOGO.length > 0, "banner must have at least one row");
    assert(TEXT_LOGO.length <= 9, "banner exceeds 9 rows");
    assert(LOGO_WIDTH > 0, "banner must have a non-zero width");
    assert(LOGO_WIDTH <= 256, "banner exceeds 256 columns");
    if (width === 0) {
        return [];
    }
    // Truncating the art below its natural width turns it into noise; keep a legible wordmark.
    if (width < LOGO_WIDTH) {
        return [center_line(theme.fg("accent", "ftagent"), width)];
    }

    const padding = " ".repeat(Math.floor((width - LOGO_WIDTH) / 2));
    return TEXT_LOGO.map((line) => padding + paint_line(theme, line));
}

export function install_banner(ctx: ExtensionContext): void {
    ctx.ui.setHeader((_tui, theme) => ({
        render: (width) => render_banner(theme, width),
        invalidate() {},
    }));
}

export default function banner_extension(pi: ExtensionAPI): void {
    pi.on("session_start", (_event, ctx) => {
        if (!ctx.hasUI) {
            return;
        }
        if (ctx.mode !== "tui") {
            return;
        }

        install_banner(ctx);
    });
}
