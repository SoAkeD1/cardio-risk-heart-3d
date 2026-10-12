// window.__cardiolens test hook: exposed only in dev builds or test builds (CARDIOLENS_TEST_HOOKS=1).
import { useStore } from "../state/store";

declare const __TEST_HOOKS__: boolean;

type MeshColorFn = () => Record<string, string>;
const registry: { getMeshColors?: MeshColorFn; getFps?: () => number; projectAnchor?: (n: string) => { x: number; y: number } | null } = {};

export function registerTestHook<K extends keyof typeof registry>(k: K, fn: (typeof registry)[K]) {
  registry[k] = fn;
}

export function testHooksEnabled(): boolean {
  return import.meta.env.DEV || (typeof __TEST_HOOKS__ !== "undefined" && __TEST_HOOKS__);
}

export function installTestHooks() {
  if (!testHooksEnabled()) return;
  (window as unknown as { __cardiolens: unknown }).__cardiolens = {
    getMeshColors: () => registry.getMeshColors?.() ?? {},
    getFps: () => registry.getFps?.() ?? 0,
    projectAnchor: (n: string) => registry.projectAnchor?.(n) ?? null,
    getState: () => {
      const s = useStore.getState();
      return { selection: s.selection, explainTarget: s.explainTarget, view: s.view, pending: s.pending, caseId: s.caseId };
    },
    sceneColors: () => {
      const sc = useStore.getState().prediction?.scene;
      return sc ? Object.fromEntries(Object.entries(sc.meshes).map(([k, m]) => [k, m.color])) : {};
    },
  };
}
