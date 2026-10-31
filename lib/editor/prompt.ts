import {
    CustomEditor,
    type KeybindingsManager,
    VERSION,
} from "@earendil-works/pi-coding-agent";
import {
    decodeKittyPrintable,
    Editor,
    isKeyRelease,
    matchesKey,
    parseKey,
    truncateToWidth,
    visibleWidth,
} from "@earendil-works/pi-tui";
import { create_editor_adapter } from "./adapter.ts";
import { NormalEngine, type Position } from "./normal.ts";
import { OperatorEngine, type OperatorResult } from "./operators.ts";
import { VisualEngine } from "./visual.ts";

type EditorMode = "normal" | "insert";
type EditorAdapter = ReturnType<typeof create_editor_adapter>;

function frame_prompt_lines(
    lines: string[],
    width: number,
    border_color: (text: string) => string,
): string[] {
    if (lines.length === 0 || width < 2) {
        return lines.map((line) => truncateToWidth(line, width, ""));
    }

    const inner_width = width - 2;
    const top = border_color(`╭${"─".repeat(width - 2)}╮`);
    const bottom = border_color(`╰${"─".repeat(width - 2)}╯`);
    const framed = [top];
    const content_lines = lines.length === 1 ? lines : lines.slice(1, -1);

    for (const line of content_lines) {
        const content = truncateToWidth(line, inner_width, "");
        const padding = " ".repeat(
            Math.max(0, inner_width - visibleWidth(content)),
        );
        framed.push(
            border_color("│") +
                content +
                padding +
                border_color("│"),
        );
    }

    framed.push(bottom);
    return framed;
}

const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";
const PASTE_LIMIT = 1024 * 1024;
const SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function is_grapheme(value: string): boolean {
    return [...SEGMENTER.segment(value)].length === 1;
}

export class PromptEditor extends CustomEditor {
    private mode: EditorMode = "insert";
    private readonly normal_engine = new NormalEngine();
    private readonly operator_engine = new OperatorEngine();
    private readonly visual_engine = new VisualEngine();
    private readonly keybindings_manager: KeybindingsManager;
    private readonly notify_compatibility: (message: string) => void;
    private insert_intent:
        | { operator?: OperatorResult; command?: string }
        | undefined;
    private insert_session_active = false;
    private visual_object_pending: "i" | "a" | undefined;
    private visual_replace_pending = false;
    private paste_frame: string | undefined;
    private paste_tail = "";
    private paste_overflow = false;
    private compatibility_notified = false;

    constructor(
        tui: ConstructorParameters<typeof CustomEditor>[0],
        theme: ConstructorParameters<typeof CustomEditor>[1],
        keybindings: KeybindingsManager,
        notify_compatibility: (message: string) => void,
    ) {
        super(tui, theme, keybindings);
        this.keybindings_manager = keybindings;
        this.notify_compatibility = notify_compatibility;
    }

    private editor_adapter(): EditorAdapter {
        return create_editor_adapter(this, VERSION, Editor, VERSION);
    }

    private report_compatibility(message: string): void {
        if (this.compatibility_notified) {
            return;
        }
        this.compatibility_notified = true;
        this.notify_compatibility(message);
    }

    private enter_insert(command?: string, operator?: OperatorResult): void {
        if (this.mode === "insert") {
            return;
        }
        try {
            this.editor_adapter().begin_insert_session();
            this.insert_session_active = true;
            this.mode = "insert";
            this.insert_intent = { command, operator };
            this.tui.requestRender();
        } catch {
            this.report_compatibility(
                "ftagent Vim is unavailable for this Pi editor; input remains unchanged.",
            );
        }
    }

    private enter_normal(): void {
        if (this.insert_session_active) {
            try {
                const inserted = this.editor_adapter().end_insert_session();
                if (inserted !== undefined && this.insert_intent?.operator) {
                    this.operator_engine.remember_insert(
                        this.insert_intent.operator,
                        inserted,
                    );
                } else if (
                    inserted !== undefined &&
                    this.insert_intent?.command !== undefined
                ) {
                    this.operator_engine.remember_literal_insert(
                        this.insert_intent.command,
                        inserted,
                    );
                }
            } catch {
                this.report_compatibility(
                    "ftagent could not group this insert for Vim undo/repeat.",
                );
            }
        }
        this.insert_session_active = false;
        this.insert_intent = undefined;
        this.mode = "normal";
        this.normal_engine.reset();
        this.visual_engine.cancel();
        this.operator_engine.cancel();
        this.tui.requestRender();
    }

    private command_for(data: string): string | undefined {
        if (matchesKey(data, "space")) {
            return "Space";
        }
        if (matchesKey(data, "left")) {
            return "h";
        }
        if (matchesKey(data, "down")) {
            return "j";
        }
        if (matchesKey(data, "up")) {
            return "k";
        }
        if (matchesKey(data, "right")) {
            return "l";
        }
        const printable = decodeKittyPrintable(data) ?? parseKey(data) ?? data;
        if (printable === " ") {
            return "Space";
        }
        if (!is_grapheme(printable)) {
            return undefined;
        }
        if (
            data === printable ||
            matchesKey(data, printable as Parameters<typeof matchesKey>[1])
        ) {
            return printable;
        }
        return undefined;
    }

    private handle_paste_frame(data: string): boolean {
        if (this.paste_frame === undefined) {
            const start = data.indexOf(PASTE_START);
            if (start < 0) {
                return false;
            }
            this.paste_frame = "";
            this.paste_overflow = false;
            data = data.slice(start + PASTE_START.length);
        }

        const chunk = this.paste_tail + data;
        const end = chunk.indexOf(PASTE_END);
        const content = end < 0
            ? chunk.slice(0, -(PASTE_END.length - 1))
            : chunk.slice(0, end);
        if (!this.paste_overflow) {
            if (this.paste_frame.length + content.length > PASTE_LIMIT) {
                this.paste_frame = "";
                this.paste_overflow = true;
            } else {
                this.paste_frame += content;
            }
        }
        if (end < 0) {
            this.paste_tail = chunk.slice(-(PASTE_END.length - 1));
            return true;
        }

        const paste = this.paste_frame;
        const overflow = this.paste_overflow;
        const remaining = chunk.slice(end + PASTE_END.length);
        this.paste_frame = undefined;
        this.paste_tail = "";
        this.paste_overflow = false;
        if (!overflow && this.mode === "insert") {
            super.handleInput(PASTE_START + paste + PASTE_END);
        }
        if (remaining.length > 0) {
            this.handleInput(remaining);
        }
        return true;
    }

    private handle_mode_key(data: string): boolean {
        if (this.mode === "insert") {
            if (matchesKey(data, "escape") && this.isShowingAutocomplete()) {
                return false;
            }
            if (
                matchesKey(data, "escape") ||
                this.keybindings_manager.matches(data, "app.interrupt")
            ) {
                this.enter_normal();
                return true;
            }
            return false;
        }

        if (isKeyRelease(data)) {
            return true;
        }
        if (
            matchesKey(data, "escape") &&
            this.visual_engine.active
        ) {
            this.visual_engine.cancel();
            this.visual_object_pending = undefined;
            this.visual_replace_pending = false;
            this.operator_engine.cancel();
            this.normal_engine.reset();
            this.tui.requestRender();
            return true;
        }
        if (
            matchesKey(data, "escape") &&
            (this.operator_engine.cancel() ||
                this.normal_engine.cancel_pending_find())
        ) {
            this.tui.requestRender();
            return true;
        }
        if (
            matchesKey(data, "escape") ||
            this.keybindings_manager.matches(data, "app.interrupt") ||
            matchesKey(data, "enter")
        ) {
            return false;
        }
        if (this.getText().trimStart().startsWith("!")) {
            this.enter_insert();
            return false;
        }
        if (matchesKey(data, "tab")) {
            this.enter_insert();
            return false;
        }

        const command = this.command_for(data);
        if (command === undefined) {
            const parsed = parseKey(data);
            if (parsed?.includes("+")) {
                this.enter_insert();
                return false;
            }
            return true;
        }
        if (command === "/" && !this.visual_engine.active) {
            this.enter_insert();
            return false;
        }
        return this.handle_normal_command(command);
    }

    handleInput(data: string): void {
        if (this.handle_paste_frame(data)) {
            return;
        }
        try {
            if (this.handle_mode_key(data)) {
                return;
            }
        } catch (error) {
            const detail = error instanceof Error
                ? error.message
                : String(error);
            this.report_compatibility(
                `ftagent Vim ignored an unsafe editor action: ${detail}`,
            );
            return;
        }
        super.handleInput(data);
    }

    private handle_normal_command(command: string): boolean {
        let adapter: EditorAdapter;
        try {
            adapter = this.editor_adapter();
        } catch {
            this.mode = "insert";
            this.report_compatibility(
                "ftagent Vim requires the audited Pi 1.4.0 editor; ordinary editing is active.",
            );
            return false;
        }

        if (command === "v" || command === "V") {
            let cursor = this.getCursor();
            if (command === "v") {
                const stops = adapter.motion_boundaries()[cursor.line];
                if (stops === undefined) {
                    throw new Error("Vim cursor line has no motion boundaries");
                }
                if (
                    stops.length > 1 &&
                    cursor.col === stops[stops.length - 1] &&
                    cursor.line < this.getText().split("\n").length - 1
                ) {
                    cursor = {
                        line: cursor.line,
                        col: stops[stops.length - 2]!,
                    };
                    adapter.move(cursor);
                }
            }
            if (
                this.visual_engine.active &&
                this.visual_engine.kind === (command === "v" ? "char" : "line")
            ) {
                this.visual_engine.cancel();
            } else {
                this.visual_engine.start(
                    command === "v" ? "char" : "line",
                    cursor,
                );
            }
            this.normal_engine.reset();
            this.operator_engine.cancel();
            this.tui.requestRender();
            return true;
        }
        if (this.visual_engine.active) {
            return this.handle_visual_command(command, adapter);
        }
        if (command === "u") {
            adapter.undo();
            this.normal_engine.reset();
            this.tui.requestRender();
            return true;
        }
        if (command === ".") {
            this.repeat_change(adapter);
            return true;
        }

        const was_pending = this.operator_engine.is_pending;
        const operation = this.operator_engine.input(
            command,
            this.getText(),
            this.getCursor(),
            adapter.motion_boundaries(),
        );
        if (operation !== null) {
            if (operation.edit) {
                this.apply_operation(operation, adapter);
            }
            if (was_pending || !/^[0-9]$/.test(command)) {
                this.tui.requestRender();
                return true;
            }
        }

        const motion = this.normal_engine.input(
            command,
            this.getText(),
            this.getCursor(),
            adapter.motion_boundaries(),
        );
        if (!motion.handled) {
            return true;
        }
        adapter.move(motion.cursor);
        if (motion.insert !== undefined) {
            if (motion.insert === "\n") {
                this.insert_newline(command, motion.cursor, adapter);
            } else {
                this.enter_insert(command);
            }
        }
        this.tui.requestRender();
        return true;
    }

    private apply_operation(
        operation: OperatorResult,
        adapter: EditorAdapter,
    ): void {
        const edit = operation.edit;
        if (edit === undefined) {
            return;
        }
        try {
            if (edit.insert) {
                adapter.begin_insert_session();
                this.insert_session_active = true;
            }
            if (
                edit.text ||
                edit.start.line !== edit.end.line ||
                edit.start.col !== edit.end.col
            ) {
                adapter.replace(edit.start, edit.end, edit.text);
            }
            adapter.move(edit.cursor);
            if (edit.insert) {
                adapter.mark_insert_anchor();
                this.insert_intent = { operator: operation };
                this.mode = "insert";
            } else {
                this.operator_engine.remember(operation);
            }
        } catch {
            if (edit.insert && this.insert_session_active) {
                try {
                    adapter.end_insert_session();
                } catch {
                    this.report_compatibility(
                        "ftagent could not restore the editor after a failed Vim edit.",
                    );
                }
                this.insert_session_active = false;
            }
            this.report_compatibility(
                "ftagent could not apply that Vim edit safely; the prompt is unchanged.",
            );
        }
    }

    private handle_visual_command(
        command: string,
        adapter: EditorAdapter,
    ): boolean {
        const cursor = this.getCursor();
        if (this.visual_object_pending !== undefined) {
            const around = this.visual_object_pending;
            this.visual_object_pending = undefined;
            const stops = adapter.motion_boundaries();
            const range = this.visual_engine.object(
                this.getText(),
                cursor,
                stops,
                around,
                command,
            );
            if (range !== undefined) {
                const end_stops = stops[range.end.line];
                const end_index = end_stops?.indexOf(range.end.col) ?? -1;
                let last: Position | undefined;
                if (end_stops !== undefined && end_index > 0) {
                    last = {
                        line: range.end.line,
                        col: end_stops[end_index - 1]!,
                    };
                } else if (range.end.line > 0) {
                    const previous_stops = stops[range.end.line - 1];
                    const previous_col = previous_stops?.at(-1);
                    if (previous_col !== undefined) {
                        last = { line: range.end.line - 1, col: previous_col };
                    }
                }
                if (last !== undefined) {
                    this.visual_engine.start("char", range.start);
                    adapter.move(last);
                }
            }
            this.tui.requestRender();
            return true;
        }
        if (this.visual_replace_pending) {
            this.visual_replace_pending = false;
            if (is_grapheme(command) && !command.includes("\n")) {
                const range = this.visual_engine.range(
                    this.getText(),
                    cursor,
                    adapter.motion_boundaries(),
                );
                if (range !== undefined) {
                    const edit = this.operator_engine.visual_edit(
                        `r${command}`,
                        this.getText(),
                        range,
                    ).edit;
                    if (edit !== undefined) {
                        adapter.replace(edit.start, edit.end, edit.text);
                        adapter.move(edit.cursor);
                    }
                    this.visual_engine.cancel();
                }
            }
            this.tui.requestRender();
            return true;
        }
        if (command === "o") {
            const target = this.visual_engine.swap(cursor);
            if (target !== undefined) {
                adapter.move(target);
            }
            this.tui.requestRender();
            return true;
        }
        if (command === "i" || command === "a") {
            this.visual_object_pending = command;
            return true;
        }
        if (command === "r") {
            this.visual_replace_pending = true;
            return true;
        }
        if (
            !["d", "x", "c", "s", "y", "p", "~", "u", "U", ">", "<", "J"]
                .includes(command)
        ) {
            const motion = this.normal_engine.input(
                command,
                this.getText(),
                cursor,
                adapter.motion_boundaries(),
            );
            if (motion.handled) {
                adapter.move(motion.cursor);
                this.tui.requestRender();
            }
            return true;
        }

        const range = this.visual_engine.range(
            this.getText(),
            cursor,
            adapter.motion_boundaries(),
        );
        if (range === undefined) {
            return true;
        }
        const original = adapter.read_range(range.start, range.end);
        const operation = this.operator_engine.visual_edit(
            command === "x" ? "d" : command === "s" ? "c" : command,
            this.getText(),
            range,
        );
        if (command === "y") {
            this.operator_engine.visual_register(original, range.linewise);
        } else if (operation.edit !== undefined) {
            this.apply_operation(operation, adapter);
            if (
                command === "d" || command === "x" || command === "c" ||
                command === "s" ||
                command === "p"
            ) {
                this.operator_engine.visual_register(original, range.linewise);
            }
        }
        this.visual_engine.cancel();
        this.visual_object_pending = undefined;
        this.visual_replace_pending = false;
        this.normal_engine.reset();
        this.tui.requestRender();
        return true;
    }

    private insert_newline(
        command: string,
        position: Position,
        adapter: EditorAdapter,
    ): void {
        const line = position.line;
        const column = command === "O" ? 0 : position.col;
        adapter.begin_insert_session();
        adapter.replace({ line, col: column }, { line, col: column }, "\n");
        const destination = command === "O"
            ? { line, col: 0 }
            : { line: line + 1, col: 0 };
        adapter.move(destination);
        this.insert_session_active = true;
        this.insert_intent = { command };
        this.mode = "insert";
    }

    private repeat_change(adapter: EditorAdapter): void {
        const count = this.operator_engine.take_repeat_count();
        this.normal_engine.reset();
        for (let index = 0; index < count; index += 1) {
            const insert_command = this.operator_engine.repeat_insert_command;
            const inserted = this.operator_engine.repeat_insertion;
            const literal = insert_command === undefined
                ? undefined
                : new NormalEngine().input(
                    insert_command,
                    this.getText(),
                    this.getCursor(),
                    adapter.motion_boundaries(),
                );
            const change = insert_command === undefined
                ? this.operator_engine.repeat_at(
                    this.getText(),
                    this.getCursor(),
                    adapter.motion_boundaries(),
                )
                : undefined;
            if (change?.edit === undefined && !(literal?.handled && inserted)) {
                break;
            }
            try {
                if (change?.edit !== undefined) {
                    if (change.edit.insert) {
                        adapter.begin_insert_session();
                    }
                    adapter.replace(
                        change.edit.start,
                        change.edit.end,
                        change.edit.text,
                    );
                    adapter.move(change.edit.cursor);
                }
                if (literal?.handled && inserted !== undefined) {
                    adapter.move(literal.cursor);
                    adapter.replace(literal.cursor, literal.cursor, inserted);
                } else if (change?.edit?.insert && inserted !== undefined) {
                    adapter.replace(
                        change.edit.cursor,
                        change.edit.cursor,
                        inserted,
                    );
                }
                if (change?.edit?.insert) {
                    adapter.end_insert_session();
                }
            } catch {
                this.report_compatibility(
                    "ftagent stopped Vim repeat because the edit was unsafe.",
                );
                break;
            }
        }
        this.tui.requestRender();
    }

    render(width: number): string[] {
        let lines = super.render(width);
        if (this.visual_engine.active) {
            try {
                const adapter = this.editor_adapter();
                const range = this.visual_engine.range(
                    this.getText(),
                    this.getCursor(),
                    adapter.motion_boundaries(),
                );
                if (range !== undefined) {
                    lines = adapter.render_selection(
                        width,
                        range.start,
                        range.end,
                        lines,
                    );
                }
            } catch {
                this.report_compatibility(
                    "ftagent could not draw this Vim visual selection.",
                );
            }
        }
        return frame_prompt_lines(
            lines,
            width,
            (text) => this.borderColor(text),
        );
    }
}
