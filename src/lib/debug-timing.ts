import { performance } from "node:perf_hooks";

export function createDebugRequestId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function startTimer(): number {
  return performance.now();
}

export function durationMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

