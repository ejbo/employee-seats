/**
 * 并发上限（进程内 FIFO）与超时。数值直接读 process.env（每次读取，改 env 重启即可）。
 */
function envInt(name: string, def: number, min: number): number {
  const n = Number.parseInt((process.env[name] ?? "").trim(), 10);
  return Number.isFinite(n) && n >= min ? n : def;
}

export function llmMaxConcurrent(): number {
  return envInt("LLM_MAX_CONCURRENT", 4, 1);
}
export function llmCompleteTimeoutMs(): number {
  return envInt("LLM_COMPLETE_TIMEOUT_MS", 180_000, 1_000);
}

export class LLMTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMTimeoutError";
  }
}

function causeOf(e: unknown): unknown {
  return (e as { cause?: unknown } | null | undefined)?.cause;
}
function isAbortShaped(e: unknown): boolean {
  return e instanceof Error && e.name === "AbortError";
}
export function isLlmCancellation(e: unknown): boolean {
  const cause = causeOf(e);
  return isAbortShaped(e) || e instanceof LLMTimeoutError || isAbortShaped(cause) || cause instanceof LLMTimeoutError;
}
export function isLlmTimeout(e: unknown): boolean {
  return e instanceof LLMTimeoutError || causeOf(e) instanceof LLMTimeoutError;
}

function abortError(): Error {
  return new DOMException("Aborted", "AbortError");
}

export interface LLMDeadline {
  readonly signal: AbortSignal;
  dispose(): void;
}

export function completeDeadline(parent?: AbortSignal): LLMDeadline {
  const ms = llmCompleteTimeoutMs();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new LLMTimeoutError(`模型在 ${Math.round(ms / 1000)} 秒内没有返回结果，请求已取消`)), ms);
  const onParent = () => ac.abort(abortError());
  if (parent) {
    if (parent.aborted) ac.abort(abortError());
    else parent.addEventListener("abort", onParent, { once: true });
  }
  return {
    signal: ac.signal,
    dispose() {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onParent);
    },
  };
}

interface Waiter {
  resolve: (release: () => void) => void;
  detach: () => void;
}
const waiting: Waiter[] = [];
let active = 0;

function makeRelease(): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    active--;
    pump();
  };
}
function pump(): void {
  const max = llmMaxConcurrent();
  while (active < max) {
    const next = waiting.shift();
    if (!next) return;
    next.detach();
    active++;
    next.resolve(makeRelease());
  }
}

export function acquireLlmSlot(signal?: AbortSignal): Promise<() => void> {
  if (signal?.aborted) return Promise.reject(abortError());
  if (active < llmMaxConcurrent()) {
    active++;
    return Promise.resolve(makeRelease());
  }
  return new Promise<() => void>((resolve, reject) => {
    const waiter: Waiter = { resolve, detach: () => undefined };
    if (signal) {
      const onAbort = () => {
        const i = waiting.indexOf(waiter);
        if (i >= 0) waiting.splice(i, 1);
        reject(abortError());
      };
      signal.addEventListener("abort", onAbort, { once: true });
      waiter.detach = () => signal.removeEventListener("abort", onAbort);
    }
    waiting.push(waiter);
  });
}

export function llmQueueDepth(): { active: number; waiting: number } {
  return { active, waiting: waiting.length };
}
