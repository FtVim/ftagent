import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

type BannerRole = "transparent" | "color" | "bright_color";
type BannerRun = readonly [role: BannerRole, content: string];
type BannerRow = readonly BannerRun[];

// Spaces stay transparent so the terminal background shows through. Strokes use
// the active theme's accent and border roles so any theme works.
const LOGO_ROWS: readonly BannerRow[] = [
    [
        ["transparent", " "],
        ["bright_color", "▄"],
        ["color", "▄"],
        ["transparent", "  "],
        ["bright_color", "▄"],
        ["transparent", "                   "],
        ["bright_color", "▄"],
        ["transparent", " "],
    ],
    [
        ["color", "█▄"],
        ["transparent", "  "],
        ["color", "▀█▀"],
        ["transparent", " "],
        ["bright_color", "▀"],
        ["color", "▀▄"],
        ["transparent", " "],
        ["color", "▄"],
        ["bright_color", "▀"],
        ["color", "█"],
        ["transparent", " "],
        ["color", "▄"],
        ["bright_color", "▀"],
        ["color", "█"],
        ["transparent", " "],
        ["bright_color", "█"],
        ["color", "■█"],
        ["transparent", " "],
        ["color", "▀█▀"],
    ],
    [
        ["color", "█"],
        ["transparent", "    "],
        ["color", "█"],
        ["transparent", "  "],
        ["color", "█▄█"],
        ["transparent", " "],
        ["color", "▀▄█"],
        ["transparent", " "],
        ["color", "█▄▄"],
        ["transparent", " "],
        ["color", "█"],
        ["transparent", " "],
        ["color", "█"],
        ["transparent", "  "],
        ["color", "█"],
        ["transparent", " "],
    ],
    [
        ["color", "▀"],
        ["transparent", "            "],
        ["color", "▄▀"],
        ["transparent", "            "],
    ],
];

function row_text(row: BannerRow): string {
    return row.map(([, content]) => content).join("");
}

// Center the whole block so short rows keep their alignment with the art.
const LOGO_WIDTH = Math.max(
    ...LOGO_ROWS.map((row) => visibleWidth(row_text(row))),
);

function assert(condition: boolean, message: string): asserts condition {
    if (!condition) {
        throw new Error(`ftagent: ${message}`);
    }
}

function paint_run(theme: Theme, role: BannerRole, content: string): string {
    switch (role) {
        case "transparent":
            assert(
                /^ *$/u.test(content),
                "transparent run must contain only spaces",
            );
            return content;
        case "color":
            return theme.fg("accent", content);
        case "bright_color":
            return theme.fg("border", content);
    }
}

function paint_row(theme: Theme, row: BannerRow): string {
    const painted = row
        .map(([role, content]) => paint_run(theme, role, content))
        .join("");
    // Coloring must not move any glyph; centered art depends on exact widths.
    assert(
        visibleWidth(painted) === visibleWidth(row_text(row)),
        "paint changed visible width",
    );
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
    assert(LOGO_ROWS.length > 0, "banner must have at least one row");
    assert(LOGO_ROWS.length <= 9, "banner exceeds 9 rows");
    assert(LOGO_WIDTH > 0, "banner must have a non-zero width");
    assert(LOGO_WIDTH <= 256, "banner exceeds 256 columns");
    assert(
        LOGO_ROWS.every((row) => visibleWidth(row_text(row)) === LOGO_WIDTH),
        "banner rows must share a width",
    );
    if (width === 0) {
        return [];
    }
    // Truncating the art below its natural width turns it into noise; keep a legible wordmark.
    if (width < LOGO_WIDTH) {
        return [center_line(theme.fg("accent", "ftagent"), width)];
    }

    const padding = " ".repeat(Math.floor((width - LOGO_WIDTH) / 2));
    return LOGO_ROWS.map((row) => padding + paint_row(theme, row));
}
