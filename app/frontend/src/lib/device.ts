// Device heuristics for choosing the lite model and reduced motion.

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function isLowEndDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const coarse = !!window.matchMedia?.("(pointer: coarse)").matches;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return (mem !== undefined && mem <= 4) || coarse || mobile;
}

export function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
