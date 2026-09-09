/**
 * Lightweight dev-only performance timing utility.
 *
 * Records timestamps at named pipeline stages and logs a summary table
 * in development mode. In production, all calls are no-ops.
 *
 * Usage:
 *   perf.mark("URL_SUBMITTED");
 *   perf.mark("METADATA_RECEIVED");
 *   perf.summary(); // logs table to console
 */

const isDev = process.env.NODE_ENV === "development";

interface PerfEntry {
  label: string;
  timestamp: number;
  elapsed: number; // ms since previous mark
}

class PerfTracker {
  private entries: PerfEntry[] = [];
  private sessionStart = Date.now();

  mark(label: string) {
    if (!isDev) return;
    const now = Date.now();
    const prev = this.entries.at(-1)?.timestamp ?? this.sessionStart;
    this.entries.push({
      label,
      timestamp: now,
      elapsed: now - prev,
    });
  }

  summary(title = "FreeClip Pipeline Timing") {
    if (!isDev || this.entries.length === 0) return;
    const total = Date.now() - this.sessionStart;
    console.groupCollapsed(`⚡ ${title} — total ${total}ms`);
    console.table(
      this.entries.map((e) => ({
        Stage: e.label,
        "Since Previous (ms)": e.elapsed,
        "Wall Time (ms)": e.timestamp - this.sessionStart,
      }))
    );
    console.groupEnd();
  }

  reset() {
    if (!isDev) return;
    this.entries = [];
    this.sessionStart = Date.now();
  }
}

/** Singleton perf tracker — one session per page load / import flow */
export const perf = new PerfTracker();

/**
 * Records a named timing mark. Call `perf.summary()` at the end of
 * an import or export flow to log the full breakdown.
 */
export function perfMark(label: string) {
  perf.mark(label);
}
