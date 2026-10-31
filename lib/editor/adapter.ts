import { CURSOR_MARKER, Editor, visibleWidth } from "@earendil-works/pi-tui";
import { createRequire } from "node:module";
interface Position {
    line: number;
    col: number;
}
interface State {
    lines: string[];
    cursorLine: number;
    cursorCol: number;
}
interface Snapshot {
    state: State;
    pastes: Map<number, string>;
    pasteCounter: number;
}
interface Stack {
    stack: Snapshot[];
    length: number;
    push(snapshot: Snapshot): void;
    pop(): Snapshot | undefined;
}
interface InsertSession {
    prefix: Snapshot[];
    before: Snapshot;
    text: string;
    anchor: number;
}
const insert_sessions = new WeakMap<object, InsertSession>();
interface LayoutLine {
    text: string;
    hasCursor: boolean;
    cursorPos?: number;
}
interface PrivateEditor {
    state: State;
    getText(): string;
    getCursor(): Position;
    onChange?: (text: string) => void;
    pastes: Map<number, string>;
    pasteCounter: number;
    atomicSpans?(line: string): Array<{ start: number; end: number }>;
    undoStack: Stack;
    history: string[];
    historyIndex: number;
    historyDraft: State | null;
    lastAction: string | null;
    preferredVisualCol: number | null;
    snappedFromCursorCol: number | null;
    scrollOffset: number;
    renderedVisibleLineCount: number;
    paddingX: number;
    layoutText(width: number): LayoutLine[];
    render(width: number): string[];
    lastWidth: number;
    pushUndoSnapshot(): void;
    undo(): void;
    setCursorCol(col: number): void;
    autocompleteState: unknown;
    cancelAutocomplete(): void;
    exitHistoryBrowsing(): void;
}

export const SUPPORTED_PI_EDITOR_VERSIONS = Object.freeze(
    ["0.99.1", "0.99.2", "1.0.0", "1.1.0", "1.2.0", "1.3.0", "1.4.0"] as const,
);
export type SupportedPiEditorVersion =
    (typeof SUPPORTED_PI_EDITOR_VERSIONS)[number];

export function is_supported_pi_editor_version(
    version: unknown,
): version is SupportedPiEditorVersion {
    return typeof version === "string" &&
        (SUPPORTED_PI_EDITOR_VERSIONS as readonly string[]).includes(version);
}
const imported_tui_metadata: unknown = (() => {
    try {
        return createRequire(import.meta.url)(
            "@earendil-works/pi-tui/package.json",
        );
    } catch {
        return undefined;
    }
})();
const imported_tui_version = typeof imported_tui_metadata === "object" &&
        imported_tui_metadata !== null &&
        "version" in imported_tui_metadata
    ? imported_tui_metadata.version
    : undefined;

function has_editor_identity(
    value: unknown,
    version: string,
    editor_class: typeof Editor,
    verified_version?: string,
): boolean {
    if (
        !is_supported_pi_editor_version(version) || typeof value !== "object" ||
        value === null ||
        (verified_version !== undefined
            ? version !== verified_version
            : editor_class === Editor
            ? version !== imported_tui_version
            : true) ||
        !(value instanceof editor_class)
    ) return false;
    let prototype: unknown = Object.getPrototypeOf(value);
    for (let depth = 0; depth < 3; depth++) {
        if (prototype === editor_class.prototype) return true;
        if (
            typeof prototype !== "object" || prototype === null ||
            !Object.hasOwn(prototype, "constructor")
        ) return false;
        prototype = Object.getPrototypeOf(prototype);
    }
    return false;
}
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const marker = /\[paste #(\d+)(?: (?:\+\d+ lines|\d+ chars))?\]/g;

const RENDERED_TOKEN_PATTERN = new RegExp(
    "\\x1b\\[[0-9;]*m|\\x1b\\][^\\x07]*(?:\\x07|\\x1b\\\\)|" +
        "\\x1b_[^\\x07\\x1b]*(?:\\x07|\\x1b\\\\)|[^\\x1b]",
    "g",
);

function highlight_rendered_row(
    row: string,
    chunk: LayoutLine,
    left: number,
    right: number,
    padding: number,
): string | undefined {
    const cursor = chunk.hasCursor ? chunk.cursorPos : undefined;
    const tokens = row.match(RENDERED_TOKEN_PATTERN);
    if (!tokens || tokens.join("") !== row) return undefined;
    let plain = "";
    for (const token of tokens) if (!token.startsWith("\x1b")) plain += token;
    const before = " ".repeat(padding);
    if (!plain.startsWith(before + chunk.text)) return undefined;
    const expected = before + chunk.text +
        (cursor === chunk.text.length ? " " : "");
    if (!plain.startsWith(expected)) return undefined;
    let result = "";
    let col = 0;
    let selected = false;
    let inverse = false;
    let native_inverse = false;
    for (const token of tokens) {
        if (token.startsWith("\x1b[")) {
            const codes = token.slice(2, -1).split(";").map(Number);
            for (let i = 0; i < codes.length; i++) {
                const code = codes[i];
                if (
                    (code === 38 || code === 48 || code === 58) &&
                    codes[i + 1] === 2 && i + 4 < codes.length
                ) i += 4;
                else if (
                    (code === 38 || code === 48 || code === 58) &&
                    codes[i + 1] === 5 && i + 2 < codes.length
                ) i += 2;
                else if (code === 0 || code === 27) {
                    native_inverse = inverse = false;
                } else if (code === 7) native_inverse = inverse = true;
            }
            result += token;
            if (selected && !inverse) {
                result += "\x1b[7m";
                inverse = true;
            }
        } else if (token.startsWith("\x1b")) {
            if (
                token !== CURSOR_MARKER && token !== "\x1b_pi:fc\x07" &&
                token !== "\x1b_pi:/fc\x07"
            ) return undefined;

            const local = col - padding;
            if (
                (token === CURSOR_MARKER || token === "\x1b_pi:fc\x07") &&
                selected &&
                !(local >= left && local < right && local < chunk.text.length)
            ) {
                if (!native_inverse && inverse) result += "\x1b[27m";
                selected = false;
                inverse = native_inverse;
            }
            result += token;

            if (token === "\x1b_pi:/fc\x07" && selected) result += "\x1b[7m";
        } else {
            const local = col - padding;
            const should_select = local >= left && local < right &&
                local < chunk.text.length;
            if (should_select !== selected) {
                if (should_select || !native_inverse && inverse) {
                    result += should_select ? "\x1b[7m" : "\x1b[27m";
                }
                selected = should_select;
                inverse = should_select || native_inverse;
            }
            result += token;
            col++;
        }
    }
    if (selected && !native_inverse) result += "\x1b[27m";
    return result;
}

function boundaries(
    line: string,
    editor: Pick<PrivateEditor, "pastes" | "atomicSpans">,
): number[] {
    const units = [...segmenter.segment(line)].map((part) => part.index);
    const spans = [...line.matchAll(marker)]
        .filter((match) => editor.pastes.has(Number(match[1])))
        .map((match) => ({
            start: match.index,
            end: match.index + match[0].length,
        }));
    if (typeof editor.atomicSpans === "function") {
        spans.push(...editor.atomicSpans(line));
    }
    for (const { start, end } of spans) {
        for (let i = units.length - 1; i >= 0; i--) {
            if (units[i]! > start && units[i]! < end) units.splice(i, 1);
        }
    }
    return [...units, line.length];
}

function assert_unique_pastes(editor: PrivateEditor): void {
    const registered = new Set<number>();
    for (const match of editor.getText().matchAll(marker)) {
        const id = Number(match[1]);
        if (!editor.pastes.has(id)) continue;
        if (registered.has(id)) {
            throw new Error(
                "Duplicate registered paste marker: private Vim editing is unsafe",
            );
        }
        registered.add(id);
    }
}

function assert_position(editor: PrivateEditor, pos: Position): void {
    assert_unique_pastes(editor);
    const line = editor.state.lines[pos.line];
    if (
        line === undefined || !Number.isInteger(pos.col) ||
        !boundaries(line, editor).includes(pos.col)
    ) {
        throw new Error("Cursor must be on a valid grapheme or paste boundary");
    }
}

function has_snapshot_shape(value: unknown): value is Snapshot {
    if (
        typeof value !== "object" || value === null || !("state" in value) ||
        !("pastes" in value) || !("pasteCounter" in value)
    ) return false;
    const state = value.state;
    return typeof state === "object" && state !== null && "lines" in state &&
        Array.isArray(state.lines) && state.lines.length > 0 &&
        state.lines.every((line) => typeof line === "string") &&
        "cursorLine" in state && Number.isInteger(state.cursorLine) &&
        typeof state.cursorLine === "number" && state.cursorLine >= 0 &&
        state.cursorLine < state.lines.length &&
        "cursorCol" in state && typeof state.cursorCol === "number" &&
        Number.isInteger(state.cursorCol) &&
        state.cursorCol >= 0 &&
        state.cursorCol <= state.lines[state.cursorLine].length &&
        value.pastes instanceof Map &&
        [...value.pastes].every(([id, text]) =>
            Number.isInteger(id) && id > 0 && typeof text === "string"
        ) &&
        typeof value.pasteCounter === "number" &&
        Number.isInteger(value.pasteCounter) && value.pasteCounter >= 0;
}

export function create_editor_adapter(
    value: unknown,
    version: string,
    editor_class: typeof Editor = Editor,
    verified_version?: string,
) {
    if (!has_editor_identity(value, version, editor_class, verified_version)) {
        throw new Error("Unsupported Pi editor layout/version");
    }
    const editor = value as unknown as PrivateEditor;
    const s = editor.state;
    if (
        !s || !Array.isArray(s.lines) || s.lines.length === 0 ||
        !s.lines.every((line) => typeof line === "string") ||
        !Number.isInteger(s.cursorLine) || !Number.isInteger(s.cursorCol) ||
        !(editor.pastes instanceof Map) ||
        !Number.isInteger(editor.pasteCounter) ||
        !Array.isArray(editor.history) ||
        typeof editor.undoStack?.push !== "function" ||
        typeof editor.undoStack?.pop !== "function" ||
        !Array.isArray(editor.undoStack.stack) ||
        editor.undoStack.length !== editor.undoStack.stack.length ||
        !has_snapshot_shape(editor) ||
        !editor.undoStack.stack.every(has_snapshot_shape) ||
        typeof editor.getText !== "function" ||
        typeof editor.getCursor !== "function" ||
        !editor.history.every((line) => typeof line === "string") ||
        typeof editor.pushUndoSnapshot !== "function" ||
        typeof editor.undo !== "function" ||
        typeof editor.setCursorCol !== "function" ||
        typeof editor.cancelAutocomplete !== "function" ||
        typeof editor.exitHistoryBrowsing !== "function" ||
        typeof editor.layoutText !== "function" ||
        typeof editor.render !== "function" ||
        !Number.isInteger(editor.paddingX) || editor.paddingX < 0
    ) {
        throw new Error("Unsupported Pi editor layout/version");
    }
    assert_position(editor, { line: s.cursorLine, col: s.cursorCol });
    return {
        dismiss_autocomplete(): void {
            editor.cancelAutocomplete();
        },
        undo(): void {
            assert_unique_pastes(editor);
            editor.undo();
        },
        begin_insert_session(): void {
            assert_unique_pastes(editor);
            if (insert_sessions.has(editor)) {
                throw new Error("Insert session already active");
            }
            const cursor = editor.getCursor();
            const anchor = editor.state.lines.slice(0, cursor.line).reduce(
                (n, line) => n + line.length + 1,
                0,
            ) + cursor.col;
            insert_sessions.set(editor, {
                prefix: editor.undoStack.stack.slice(),
                anchor,
                before: structuredClone({
                    state: editor.state,
                    pastes: editor.pastes,
                    pasteCounter: editor.pasteCounter,
                }),
                text: editor.getText(),
            });
        },
        mark_insert_anchor(): void {
            assert_unique_pastes(editor);
            const session = insert_sessions.get(editor);
            if (!session) return;
            const cursor = editor.getCursor();
            session.anchor = editor.state.lines.slice(0, cursor.line).reduce(
                (n, line) => n + line.length + 1,
                0,
            ) + cursor.col;
            session.text = editor.getText();
        },
        end_insert_session(): string | undefined {
            const session = insert_sessions.get(editor);
            insert_sessions.delete(editor);
            assert_unique_pastes(editor);
            if (!session) return;
            const stack = editor.undoStack;
            const depth = session.prefix.length;
            if (
                stack.length < depth || stack.length !== stack.stack.length ||
                session.prefix.some((snapshot, index) =>
                    stack.stack[index] !== snapshot
                )
            ) return;
            const after = editor.getText();
            const inserted =
                after.startsWith(session.text.slice(0, session.anchor)) &&
                    after.endsWith(session.text.slice(session.anchor))
                    ? after.slice(
                        session.anchor,
                        after.length - (session.text.length - session.anchor),
                    )
                    : undefined;
            if (
                after === session.before.state.lines.join("\n") &&
                editor.pasteCounter === session.before.pasteCounter
            ) {
                stack.stack.splice(depth);
                editor.lastAction = null;
                return;
            }
            if (stack.length === depth) return;
            stack.stack.splice(depth);
            stack.push(session.before);
            editor.lastAction = null;
            return inserted &&
                    editor.pasteCounter === session.before.pasteCounter &&
                    ![...inserted.matchAll(marker)].some((match) =>
                        editor.pastes.has(Number(match[1]))
                    )
                ? inserted
                : undefined;
        },
        motion_boundaries(): number[][] {
            assert_unique_pastes(editor);
            return editor.state.lines.map((line) => boundaries(line, editor));
        },
        move(pos: Position): void {
            assert_position(editor, pos);
            editor.state.cursorLine = pos.line;
            editor.setCursorCol(pos.col);
            editor.lastAction = null;
            if (editor.autocompleteState) editor.cancelAutocomplete();
        },
        move_by_graphemes(delta: number): void {
            if (!Number.isInteger(delta)) throw new Error("Invalid motion");
            const positions = editor.state.lines.flatMap((line, index) =>
                boundaries(line, editor).map((col) => ({ line: index, col }))
            );
            const current = editor.getCursor();
            const at = positions.findIndex((p) =>
                p.line === current.line && p.col === current.col
            );
            if (at < 0) throw new Error("Invalid cursor boundary");
            const target = positions[
                Math.max(0, Math.min(positions.length - 1, at + delta))
            ]!;
            this.move(target);
        },
        read_range(start: Position, end: Position): string {
            assert_position(editor, start);
            assert_position(editor, end);
            const offset = (p: Position) =>
                editor.state.lines.slice(0, p.line).reduce(
                    (n, line) => n + line.length + 1,
                    0,
                ) + p.col;
            const a = offset(start), b = offset(end);
            if (b < a) throw new Error("Invalid selection range");
            const source = editor.getText();
            for (const match of source.matchAll(marker)) {
                if (
                    editor.pastes.has(Number(match[1])) &&
                    a < match.index + match[0].length && b > match.index
                ) {
                    throw new Error(
                        "Selection cannot edit collapsed paste marker",
                    );
                }
            }
            return source.slice(a, b);
        },
        replace(start: Position, end: Position, text: string): void {
            assert_position(editor, start);
            assert_position(editor, end);
            const source = editor.getText();
            const offset = (p: Position) =>
                editor.state.lines.slice(0, p.line).reduce(
                    (n, line) => n + line.length + 1,
                    0,
                ) + p.col;
            const a = offset(start);
            const b = offset(end);
            if (b < a || (b === a && !text) || text.includes("\r")) {
                throw new Error("Invalid operator range or replacement");
            }
            for (const match of source.matchAll(marker)) {
                if (
                    editor.pastes.has(Number(match[1])) &&
                    a < match.index + match[0].length && b > match.index
                ) {
                    throw new Error(
                        "Operator cannot edit collapsed paste marker",
                    );
                }
            }
            const next = source.slice(0, a) + text + source.slice(b);
            const registered = new Set<number>();
            for (const match of next.matchAll(marker)) {
                const id = Number(match[1]);
                if (!editor.pastes.has(id)) continue;
                if (registered.has(id)) {
                    throw new Error(
                        "Duplicate registered paste marker: private Vim editing is unsafe",
                    );
                }
                registered.add(id);
            }
            if (next === source) return;
            const lines = next.split("\n");
            const prefix = next.slice(0, a + text.length).split("\n");
            editor.cancelAutocomplete();
            editor.exitHistoryBrowsing();
            editor.pushUndoSnapshot();
            editor.state.lines = lines;
            editor.state.cursorLine = prefix.length - 1;
            editor.setCursorCol(prefix.at(-1)!.length);
            editor.lastAction = null;
            editor.scrollOffset = 0;
            editor.onChange?.(next);
        },
        render_selection(
            width: number,
            start: Position,
            end: Position,
            rendered?: string[],
        ): string[] {
            assert_position(editor, start);
            assert_position(editor, end);
            if (!Number.isInteger(width) || width < 1) {
                throw new Error("Invalid render width");
            }
            const offset = (pos: Position) =>
                editor.state.lines.slice(0, pos.line)
                    .reduce((n, line) => n + line.length + 1, 0) + pos.col;
            const from = offset(start);
            const to = offset(end);
            if (from === to) return rendered ?? editor.render(width);
            const selection_from = Math.min(from, to);
            const selection_to = Math.max(from, to);
            const rows = rendered ?? editor.render(width);
            const max_padding = Math.max(0, Math.floor((width - 1) / 2));
            const padding = Math.min(editor.paddingX, max_padding);
            const layout_width = Math.max(
                1,
                width - padding * 2 - (padding ? 0 : 1),
            );
            if (
                editor.lastWidth !== layout_width ||
                !Number.isInteger(editor.scrollOffset) ||
                editor.scrollOffset < 0
            ) return rows;
            const layout = editor.layoutText(layout_width);
            if (
                !Number.isInteger(editor.renderedVisibleLineCount) ||
                editor.renderedVisibleLineCount < 1 ||
                editor.renderedVisibleLineCount + 2 > rows.length
            ) return rows;
            const visible = layout.slice(
                editor.scrollOffset,
                editor.scrollOffset + editor.renderedVisibleLineCount,
            );
            if (visible.length !== editor.renderedVisibleLineCount) return rows;
            let logical_line = 0;
            let search_from = 0;
            for (const hidden of layout.slice(0, editor.scrollOffset)) {
                if (typeof hidden.text !== "string") return rows;
                let index = editor.state.lines[logical_line]?.indexOf(
                    hidden.text,
                    search_from,
                ) ?? -1;
                while (
                    index < 0 && logical_line + 1 < editor.state.lines.length
                ) {
                    logical_line++;
                    search_from = 0;
                    index = editor.state.lines[logical_line]!.indexOf(
                        hidden.text,
                        search_from,
                    );
                }
                if (index < 0) return rows;
                search_from = index + hidden.text.length;
            }
            const replacements: Array<[number, string]> = [];
            for (let row = 0; row < visible.length; row++) {
                const chunk = visible[row]!;
                if (
                    typeof chunk.text !== "string" ||
                    typeof chunk.hasCursor !== "boolean" ||
                    (chunk.hasCursor &&
                        (!Number.isInteger(chunk.cursorPos) ||
                            chunk.cursorPos! < 0 ||
                            chunk.cursorPos! > chunk.text.length))
                ) return rows;
                let index = editor.state.lines[logical_line]?.indexOf(
                    chunk.text,
                    search_from,
                ) ?? -1;
                while (
                    index < 0 && logical_line + 1 < editor.state.lines.length
                ) {
                    logical_line++;
                    search_from = 0;
                    index = editor.state.lines[logical_line]!.indexOf(
                        chunk.text,
                        search_from,
                    );
                }
                if (index < 0) return rows;
                search_from = index + chunk.text.length;
                const chunk_start = offset({ line: logical_line, col: index });
                const left = Math.max(
                    0,
                    Math.min(chunk.text.length, selection_from - chunk_start),
                );
                const right = Math.max(
                    0,
                    Math.min(chunk.text.length, selection_to - chunk_start),
                );
                if (right <= left) continue;
                const original = rows[row + 1]!;
                const prefix = " ".repeat(padding);
                if (!original.startsWith(prefix)) return rows;
                const result = highlight_rendered_row(
                    original,
                    chunk,
                    left,
                    right,
                    padding,
                );
                if (
                    result === undefined ||
                    visibleWidth(result) !== visibleWidth(original)
                ) return rows;
                replacements.push([row + 1, result]);
            }
            const result = rows.slice();
            for (const [index, replacement] of replacements) {
                result[index] = replacement;
            }
            return result;
        },
    };
}
