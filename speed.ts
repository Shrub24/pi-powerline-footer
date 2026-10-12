/**
 * Generation speed of one assistant request, timed from Pi's own events: the provider request starts the
 * clock, the first assistant message_update is the first token (pi-otel counts the same event), and the
 * assistant message_end carries the output token count.
 */

export interface SpeedTiming {
  startMs: number;
  firstTokenMs?: number;
}

export interface SpeedSample {
  /** Seconds from the provider request to the first token. */
  ttftSec: number;
  /** Output tokens per second over the generation window. Absent when unknown or the window is too short. */
  tokensPerSec?: number;
}

export type SpeedShow = "both" | "rate" | "ttft";

/** Shorter generation windows give absurd rates, so no rate is shown for them. */
const MIN_GENERATION_SEC = 0.2;

export function startSpeedTiming(nowMs: number): SpeedTiming {
  return { startMs: nowMs };
}

/** The first assistant update of a request is its first token; later updates change nothing. */
export function noteSpeedFirstToken(timing: SpeedTiming, nowMs: number): SpeedTiming {
  return timing.firstTokenMs === undefined ? { ...timing, firstTokenMs: nowMs } : timing;
}

/** The sample for a finished assistant message. Aborted, errored or token-less requests yield none. */
export function completeSpeedSample(
  timing: SpeedTiming,
  message: { stopReason?: string; usage?: { output?: number } },
  endMs: number,
): SpeedSample | undefined {
  if (message.stopReason === "aborted" || message.stopReason === "error" || timing.firstTokenMs === undefined) return undefined;
  const generationSec = (endMs - timing.firstTokenMs) / 1000;
  const output = message.usage?.output ?? 0;
  const tokensPerSec = output > 0 && generationSec >= MIN_GENERATION_SEC ? output / generationSec : undefined;
  return { ttftSec: (timing.firstTokenMs - timing.startMs) / 1000, tokensPerSec };
}

/** The footer text for a sample, or undefined when nothing is left to show. */
export function speedText(sample: SpeedSample | undefined, show: SpeedShow): string | undefined {
  if (!sample) return undefined;
  const parts: string[] = [];
  if (show !== "ttft" && sample.tokensPerSec !== undefined) parts.push(`${formatRate(sample.tokensPerSec)} t/s`);
  if (show !== "rate") parts.push(`${sample.ttftSec.toFixed(1)}s`);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

// Whole tokens per second below 100, then the nearest 5: the last digit is noise at high rates.
function formatRate(rate: number): string {
  return String(rate < 100 ? Math.round(rate) : Math.round(rate / 5) * 5);
}
