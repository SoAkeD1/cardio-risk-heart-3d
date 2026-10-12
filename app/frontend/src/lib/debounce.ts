// Debounce + "latest request wins" cancellation used by the live prediction flow.

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const d = (...a: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
  d.cancel = () => t && clearTimeout(t);
  return d;
}

/** Hands out AbortSignals; starting a new request aborts the previous one. */
export class LatestOnly {
  private ctrl?: AbortController;
  next(): AbortSignal {
    this.ctrl?.abort();
    this.ctrl = new AbortController();
    return this.ctrl.signal;
  }
  abort() {
    this.ctrl?.abort();
    this.ctrl = undefined;
  }
}

export const isAbort = (e: unknown) =>
  e instanceof DOMException ? e.name === "AbortError" : (e as { name?: string })?.name === "AbortError";
