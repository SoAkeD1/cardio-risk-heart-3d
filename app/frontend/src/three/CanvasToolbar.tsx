import * as Pop from "@radix-ui/react-popover";
import {
  Camera,
  Expand,
  HeartPulse,
  Layers,
  Palette,
  PersonStanding,
  RefreshCcw,
  MoreHorizontal,
  RotateCw,
  Settings2,
} from "lucide-react";
import { useAnatomyMap } from "../api/hooks";
import { useStore, type Preset } from "../state/store";
import { IconButton } from "../ui/IconButton";
import { Segmented } from "../ui/Segmented";
import { Slider } from "../ui/Slider";
import { Tooltip } from "../ui/Tooltip";
import { toast } from "../ui/Toast";
import { toggleFullscreen } from "../features/shell/Shortcuts";
import { composeSnapshot, downloadDataUrl } from "./snapshot";

const PRESETS: { p: Preset; label: string; key: string }[] = [
  { p: "front", label: "Front", key: "1" },
  { p: "left", label: "Left", key: "2" },
  { p: "posterior", label: "Back", key: "3" },
  { p: "body", label: "Body", key: "4" },
];

export function CanvasToolbar({ compact = false }: { compact?: boolean }) {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const fly = useStore((s) => s.requestFly);
  const { data: map } = useAnatomyMap();

  const preset = (p: Preset) => {
    setView({ preset: p, mode: p === "body" ? "body" : "heart" });
    fly({ preset: p });
  };
  const shot = async () => {
    try {
      const legend = useStore.getState().prediction?.scene.legend ?? null;
      const stops = map?.style.color_scale.stops.map(([p, color]) => ({ p, color }));
      downloadDataUrl(await composeSnapshot({ legend, stops }), `cardiolens-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`);
    } catch (e) {
      toast({ title: "Screenshot failed", description: (e as Error).message });
    }
  };

  const tools = (
    <>
        <IconButton
          label={`Look: ${view.look === "realistic" ? "Realistic" : "Clinical"} (switch)`}
          shortcut="L"
          active={view.look === "clinical"}
          onClick={() => setView({ look: view.look === "realistic" ? "clinical" : "realistic" })}
          data-testid="look-toggle"
        >
          <Palette />
        </IconButton>
        <IconButton
          label={map ? `Territories — ${map.territories.assumption}` : "Territories"}
          shortcut="T"
          active={view.territories}
          onClick={() => setView({ territories: !view.territories })}
        >
          <Layers />
        </IconButton>
        <IconButton label="Body mode" shortcut="B" active={view.mode === "body"} onClick={() => preset(view.mode === "body" ? "front" : "body")}>
          <PersonStanding />
        </IconButton>
        <IconButton label="Heartbeat" shortcut="H" active={view.heartbeat} onClick={() => setView({ heartbeat: !view.heartbeat })}>
          <HeartPulse />
        </IconButton>
        <IconButton label="Turntable (6°/s)" active={view.turntable} onClick={() => setView({ turntable: !view.turntable })}>
          <RotateCw />
        </IconButton>
        <IconButton label="Reset view" shortcut="R" onClick={() => fly({ preset: view.mode === "body" ? "body" : view.preset })}>
          <RefreshCcw />
        </IconButton>
        <IconButton label="Save screenshot (PNG)" onClick={shot}>
          <Camera />
        </IconButton>
        <IconButton label="Fullscreen canvas" shortcut="F" onClick={toggleFullscreen}>
          <Expand />
        </IconButton>
        <Pop.Root>
          <Tooltip content="Display quality">
            <Pop.Trigger asChild>
              <button aria-label="Display quality" className="inline-flex h-9 w-9 items-center justify-center rounded-md text-t2 hover:bg-s2 hover:text-t1">
                <Settings2 className="h-[18px] w-[18px]" />
              </button>
            </Pop.Trigger>
          </Tooltip>
          <Pop.Portal>
            <Pop.Content align="end" sideOffset={6} className="z-[70] w-64 rounded-md border border-line bg-s1 p-3 text-xs text-t2 shadow-soft">
              <div className="mb-2 font-semibold text-t1">Display quality</div>
              <Segmented
                size="sm"
                label="Display quality"
                value={view.performance}
                onChange={(v) => setView({ performance: v })}
                options={[
                  { value: "auto", label: "Auto" },
                  { value: "quality", label: "Full" },
                  { value: "lite", label: "Lite" },
                ]}
              />
              <p className="mt-2 leading-snug">Auto picks the lighter model on low-memory or touch devices and switches if the frame rate drops.</p>
            </Pop.Content>
          </Pop.Portal>
        </Pop.Root>
    </>
  );

  return (
    <div className="pointer-events-none absolute right-3 top-3 z-10 flex max-w-[calc(100%-24px)] flex-col items-end gap-2">
      <div role="toolbar" aria-label="View controls" className="pointer-events-auto flex flex-nowrap justify-end gap-0.5 rounded-md border border-line bg-s1/90 p-1 shadow-soft backdrop-blur">
        <div className="mr-1 flex rounded-md bg-s2 p-0.5" role="group" aria-label="View presets">
          {PRESETS.map(({ p, label, key }) => (
            <Tooltip key={p} content={`${label} view (${key})`}>
              <button
                aria-pressed={view.preset === p}
                onClick={() => preset(p)}
                className="h-8 rounded-[5px] px-2.5 text-xs font-medium text-t2 hover:text-t1 aria-pressed:bg-s3 aria-pressed:text-t1"
              >
                {label}
              </button>
            </Tooltip>
          ))}
        </div>
        {compact ? (
          <Pop.Root>
            <Pop.Trigger asChild>
              <button aria-label="More view controls" className="inline-flex h-9 w-9 items-center justify-center rounded-md text-t2 hover:bg-s2 hover:text-t1">
                <MoreHorizontal className="h-[18px] w-[18px]" />
              </button>
            </Pop.Trigger>
            <Pop.Portal>
              <Pop.Content align="end" sideOffset={6} className="z-[70] grid grid-cols-5 gap-0.5 rounded-md border border-line bg-s1 p-1 shadow-soft">
                {tools}
              </Pop.Content>
            </Pop.Portal>
          </Pop.Root>
        ) : (
          tools
        )}
      </div>
      {view.mode === "body" && (
        <div className="pointer-events-auto flex w-56 items-center gap-3 rounded-md border border-line bg-s1/90 px-3 py-2 text-xs text-t2 shadow-soft backdrop-blur">
          <span className="shrink-0">X-ray</span>
          <Slider label="Body transparency (x-ray)" value={view.xray} min={0.05} max={0.4} step={0.01} onChange={(v) => setView({ xray: v })} />
        </div>
      )}
    </div>
  );
}
