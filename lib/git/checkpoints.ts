import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const CHECKPOINT_COUNT_MAX = 4096;
const RESTORE_CHECKPOINT_CHOICE = "Yes, restore code to that point";

export class GitCheckpoints {
    private readonly refs = new Map<string, string>();
    private current_entry_id: string | undefined;

    track_current_entry(ctx: ExtensionContext): void {
        const leaf = ctx.sessionManager.getLeafEntry();
        if (leaf) {
            this.current_entry_id = leaf.id;
        }
    }

    async capture(
        ctx: ExtensionContext,
        exec: ExtensionAPI["exec"],
    ): Promise<void> {
        const leaf = ctx.sessionManager.getLeafEntry();
        if (!leaf) {
            return;
        }
        const entry_id = this.current_entry_id ?? leaf.id;

        const result = await exec("git", [
            "-C",
            ctx.cwd,
            "stash",
            "create",
        ]);
        if (result.code !== 0) {
            this.report_failure(ctx, "Could not create Git checkpoint", result.stderr);
            return;
        }

        const ref = result.stdout.trim();
        if (ref.length > 0) {
            this.remember(entry_id, ref);
            if (entry_id !== leaf.id) {
                this.remember(leaf.id, ref);
            }
        }
    }

    async restore(
        entry_id: string,
        ctx: ExtensionContext,
        exec: ExtensionAPI["exec"],
    ): Promise<void> {
        const ref = this.get(entry_id);
        if (!ref || !ctx.hasUI) {
            return;
        }

        const choice = await ctx.ui.select("Restore code state?", [
            RESTORE_CHECKPOINT_CHOICE,
            "No, keep current code",
        ]);
        if (choice !== RESTORE_CHECKPOINT_CHOICE) {
            return;
        }

        const result = await exec("git", [
            "-C",
            ctx.cwd,
            "stash",
            "apply",
            ref,
        ]);
        if (result.code !== 0) {
            this.report_failure(ctx, "Could not restore Git checkpoint", result.stderr);
            return;
        }
        ctx.ui.notify("Code restored to checkpoint", "info");
    }

    remember(entry_id: string, ref: string): void {
        this.refs.delete(entry_id);
        this.refs.set(entry_id, ref);
        if (this.refs.size > CHECKPOINT_COUNT_MAX) {
            const oldest_entry_id = this.refs.keys().next().value;
            if (oldest_entry_id !== undefined) {
                this.refs.delete(oldest_entry_id);
            }
        }
    }

    get(entry_id: string): string | undefined {
        return this.refs.get(entry_id);
    }

    clear(): void {
        this.refs.clear();
        this.current_entry_id = undefined;
    }

    private report_failure(
        ctx: ExtensionContext,
        action: string,
        detail: string,
    ): void {
        const message = `${action}: ${detail}`;
        if (ctx.hasUI) {
            ctx.ui.notify(message, "warning");
            return;
        }
        throw new Error(message);
    }
}
