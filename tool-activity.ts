/**
 * The tool state the tool segment shows: the most recently started running tool, else the last one that
 * finished, else idle. Keyed by Pi's tool_execution_start / tool_execution_end events.
 */

export type ToolActivity =
  | { state: "idle" }
  | { state: "running" | "done" | "failed"; name: string; /** Other tools still running alongside the one shown. */ others: number };

export class ToolActivityTracker {
  #running: Array<{ id: string; name: string }> = [];
  #last: { name: string; failed: boolean } | undefined;

  start(id: string, name: string): void {
    this.#running.push({ id, name });
  }

  end(id: string, name: string, failed: boolean): void {
    this.#running = this.#running.filter((tool) => tool.id !== id);
    this.#last = { name, failed };
  }

  reset(): void {
    this.#running = [];
    this.#last = undefined;
  }

  get activity(): ToolActivity {
    const current = this.#running.at(-1);
    if (current) return { state: "running", name: current.name, others: this.#running.length - 1 };
    if (this.#last) return { state: this.#last.failed ? "failed" : "done", name: this.#last.name, others: 0 };
    return { state: "idle" };
  }
}
