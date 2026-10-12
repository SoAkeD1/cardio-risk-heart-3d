import * as T from "@radix-ui/react-toast";
import { create } from "zustand";

/** Toasts are only for errors and mode switches (never routine updates); optional Undo action. */
type ToastItem = { id: number; title: string; description?: string; action?: { label: string; run: () => void } };

const useToasts = create<{
  items: ToastItem[];
  push: (t: Omit<ToastItem, "id">) => void;
  drop: (id: number) => void;
}>((set) => ({
  items: [],
  push: (t) => set((s) => ({ items: [...s.items.slice(-2), { ...t, id: Date.now() + Math.random() }] })),
  drop: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
}));

export const toast = (t: Omit<ToastItem, "id">) => useToasts.getState().push(t);

export function Toaster() {
  const { items, drop } = useToasts();
  return (
    <T.Provider swipeDirection="right" duration={6000}>
      {items.map((t) => (
        <T.Root
          key={t.id}
          onOpenChange={(o) => !o && drop(t.id)}
          className="flex items-start gap-3 rounded-md border border-line bg-s3 p-3 text-sm text-t1 shadow-soft"
        >
          <div className="min-w-0 flex-1">
            <T.Title className="font-semibold">{t.title}</T.Title>
            {t.description && <T.Description className="mt-0.5 text-t2">{t.description}</T.Description>}
          </div>
          {t.action && (
            <T.Action altText={t.action.label} asChild>
              <button
                className="rounded-md border border-line px-2 py-1 text-xs font-semibold hover:bg-s2"
                onClick={t.action.run}
              >
                {t.action.label}
              </button>
            </T.Action>
          )}
        </T.Root>
      ))}
      <T.Viewport className="fixed bottom-12 right-3 z-[90] flex w-[min(360px,calc(100vw-24px))] flex-col gap-2 outline-none" />
    </T.Provider>
  );
}
