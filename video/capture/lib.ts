// Capture director: records one scene of the real app, timing every action to the narration's cue words.
//
// * Browser: Microsoft Edge (H.264 for the opening video), headless, GPU (ANGLE/D3D11), 1920x1080 @1x.
//   Headless means nothing from the desktop (taskbar, notifications, other tabs) can ever reach the frames.
// * Frames: Chrome DevTools screencast (JPEG q95, every compositor frame, ~60-100 fps), timestamped,
//   then re-timed to constant 30 fps with ffmpeg (CRF 14).
// * Timing: video/voice/out/<scene>.json gives the narration duration and cue times; NARRATION.md gives
//   lead/tail. `d.at("cue")` waits until the narrator reaches that word (+ lead).
// * Human-like input: an injected soft cursor follows the real mouse; moves are eased (bezier, 400-700 ms),
//   clicks ripple, typing is 40-70 ms/key, slider drags are smooth.
import { test, type BrowserContext, type CDPSession, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const VIDEO = path.resolve(HERE, "..");
export const BASE = process.env.CAPTURE_BASE ?? "http://localhost:8000";
const HANDLE = 1.0; // s of picture before t0 and after the end (editor trims / crossfades in it)

type Voice = { duration: number; cues: Record<string, number> };
type Mark = { name: string; t: number; rect?: { x: number; y: number; w: number; h: number } };

function sceneMeta(id: string) {
  const md = fs.readFileSync(path.join(VIDEO, "NARRATION.md"), "utf-8");
  const block = md.split(/^## /m).find((b) => b.startsWith(id + " "));
  if (!block) throw new Error(`scene ${id} not in NARRATION.md`);
  const num = (k: string, d: number) => Number(block.match(new RegExp(`^- ${k}: ([0-9.]+)`, "m"))?.[1] ?? d);
  const voice = JSON.parse(fs.readFileSync(path.join(VIDEO, "voice", "out", `${id}.json`), "utf-8")) as Voice;
  return { lead: num("lead", 0.4), tail: num("tail", 0.8), voice };
}

const CURSOR_JS = () => {
  const install = () => {
    if (document.getElementById("__cap_cursor")) return;
    const c = document.createElement("div");
    c.id = "__cap_cursor";
    Object.assign(c.style, {
      position: "fixed", left: "0px", top: "0px", width: "18px", height: "18px", margin: "-9px 0 0 -9px",
      borderRadius: "50%", background: "rgba(255,255,255,0.70)", boxShadow: "0 0 0 1.5px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.35)",
      pointerEvents: "none", zIndex: "2147483647", transform: "translate(-200px,-200px)", transition: "opacity 200ms",
    });
    document.documentElement.appendChild(c);
    let x = -200, y = -200;
    addEventListener("mousemove", (e) => { x = e.clientX; y = e.clientY; c.style.transform = `translate(${x}px,${y}px)`; }, true);
    addEventListener("mousedown", () => {
      const r = document.createElement("div");
      Object.assign(r.style, {
        position: "fixed", left: `${x}px`, top: `${y}px`, width: "40px", height: "40px", margin: "-20px 0 0 -20px",
        borderRadius: "50%", border: "2px solid rgba(255,255,255,0.8)", pointerEvents: "none", zIndex: "2147483646",
        transform: "scale(0.3)", opacity: "1", transition: "transform 200ms ease-out, opacity 200ms ease-out",
      });
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = "scale(1)"; r.style.opacity = "0"; });
      setTimeout(() => r.remove(), 260);
      c.style.background = "rgba(255,255,255,0.95)";
    }, true);
    addEventListener("mouseup", () => { c.style.background = "rgba(255,255,255,0.70)"; }, true);
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", install);
  else install();
};

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2); // cubic in-out

export class Director {
  readonly id: string;
  page!: Page;
  ctx!: BrowserContext;
  private cdp!: CDPSession;
  private frames: { file: string; ts: number }[] = [];
  private dir: string;
  private t0 = 0; // wall-clock (s) of narration time 0 minus lead, i.e. picture time 0 after the handle
  private recording = false;
  private writes: Promise<void>[] = [];
  private mx = 1500; // start off the canvas: no hover tooltip in the first frames
  private my = 1000;
  readonly lead: number;
  readonly tail: number;
  readonly voice: Voice;
  marks: Mark[] = [];

  readonly clip: string;

  constructor(id: string, clip?: string) {
    this.id = id;
    this.clip = clip ?? id;
    const m = sceneMeta(id);
    this.lead = m.lead;
    this.tail = m.tail;
    this.voice = m.voice;
    this.dir = path.join(VIDEO, "raw", this.clip);
  }

  /** total picture length of the scene, excluding handles */
  get length() {
    return this.lead + this.voice.duration + this.tail;
  }

  async init(ctx: BrowserContext, page: Page) {
    this.ctx = ctx;
    this.page = page;
    await page.addInitScript(CURSOR_JS);
    fs.rmSync(this.dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(this.dir, "frames"), { recursive: true });
  }

  /** Prepare app state (prefs, opening, tour) before navigation. */
  async prefs(opts: { theme?: "dark" | "light"; tourDone?: boolean; opening?: boolean; view?: Record<string, unknown> } = {}) {
    await this.page.addInitScript(
      ([theme, tourDone, opening, view]) => {
        try {
          if (!opening) sessionStorage.setItem("cardiolens:opening-seen", "1");
          if (!sessionStorage.getItem("__cap_init")) {
            localStorage.setItem("cardiolens.prefs.v1", JSON.stringify({ state: { ui: { theme, tourDone }, ...(view ? { view } : {}) }, version: 0 }));
            sessionStorage.setItem("__cap_init", "1");
          }
        } catch { /* ignore */ }
      },
      [opts.theme ?? "dark", opts.tourDone ?? true, !!opts.opening, opts.view ?? null] as const,
    );
  }

  async goto(url: string, waitColours = true) {
    await this.page.goto(BASE + url);
    if (waitColours) await this.waitColours();
  }

  async waitColours() {
    await this.page.waitForFunction(() => {
      const h = (window as unknown as { __cardiolens?: { sceneColors: () => Record<string, string>; getMeshColors: () => Record<string, string> } }).__cardiolens;
      if (!h) return false;
      const s = h.sceneColors(), m = h.getMeshColors();
      const k = ["Coronary_LAD", "Coronary_LCX", "Coronary_RCA"];
      return k.every((n) => s[n] && m[n] && s[n] === m[n]);
    }, undefined, { timeout: 30_000 });
  }

  async start() {
    this.cdp = await this.ctx.newCDPSession(this.page);
    this.cdp.on("Page.screencastFrame", (f) => {
      if (!this.recording) return;
      const file = path.join(this.dir, "frames", `${String(this.frames.length).padStart(6, "0")}.jpg`);
      this.frames.push({ file, ts: f.metadata.timestamp ?? Date.now() / 1000 });
      this.writes.push(fs.promises.writeFile(file, Buffer.from(f.data, "base64")));
      void this.cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
    });
    this.recording = true;
    await this.cdp.send("Page.startScreencast", { format: "jpeg", quality: 95, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
    // nudge a repaint so there is a first frame immediately
    await this.page.mouse.move(this.mx, this.my);
    await this.page.waitForTimeout(HANDLE * 1000);
    this.t0 = Date.now() / 1000;
  }

  /** seconds since picture time 0 */
  now() {
    return Date.now() / 1000 - this.t0;
  }

  /** wait until picture time t (seconds) */
  async until(t: number) {
    const ms = (t - this.now()) * 1000;
    if (ms > 0) await this.page.waitForTimeout(ms);
  }

  /** picture time of a narration cue (+ offset) */
  cue(name: string, offset = 0) {
    const c = this.voice.cues[name];
    if (c === undefined) throw new Error(`${this.id}: unknown cue ${name}`);
    return this.lead + c + offset;
  }

  /** wait for a narration cue. Negative offset = act slightly before the word (callouts lead the action). */
  async at(name: string, offset = 0) {
    await this.until(this.cue(name, offset));
  }

  async mark(name: string, target?: Locator) {
    const box = target ? await target.boundingBox().catch(() => null) : null;
    this.marks.push({ name, t: +this.now().toFixed(3), ...(box ? { rect: { x: box.x, y: box.y, w: box.width, h: box.height } } : {}) });
  }

  // ---------- human-like input ----------
  async moveTo(x: number, y: number, ms?: number) {
    const dist = Math.hypot(x - this.mx, y - this.my);
    const dur = ms ?? Math.min(700, Math.max(400, 300 + dist * 0.35));
    const steps = Math.max(8, Math.round(dur / 16));
    const sx = this.mx, sy = this.my;
    // a slight arc, like a hand
    const nx = -(y - sy) * 0.08, ny = (x - sx) * 0.08;
    const t0 = Date.now();
    for (let i = 1; i <= steps; i++) {
      const k = ease(i / steps);
      const arc = Math.sin(Math.PI * (i / steps));
      await this.page.mouse.move(sx + (x - sx) * k + nx * arc, sy + (y - sy) * k + ny * arc);
      const wait = t0 + (dur * i) / steps - Date.now();
      if (wait > 0) await this.page.waitForTimeout(wait);
    }
    this.mx = x;
    this.my = y;
  }

  async moveToLoc(loc: Locator, fx = 0.5, fy = 0.5) {
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    if (!b) throw new Error(`${this.id}: no box for locator`);
    await this.moveTo(b.x + b.width * fx, b.y + b.height * fy);
  }

  async click(loc: Locator, opts: { fx?: number; fy?: number; pause?: number; modifiers?: ("Alt" | "Shift" | "Control")[] } = {}) {
    await this.moveToLoc(loc, opts.fx, opts.fy);
    await this.page.waitForTimeout(120);
    for (const m of opts.modifiers ?? []) await this.page.keyboard.down(m);
    await this.page.mouse.down();
    await this.page.waitForTimeout(70);
    await this.page.mouse.up();
    for (const m of opts.modifiers ?? []) await this.page.keyboard.up(m);
    if (opts.pause) await this.page.waitForTimeout(opts.pause);
  }

  async clickAt(x: number, y: number) {
    await this.moveTo(x, y);
    await this.page.waitForTimeout(100);
    await this.page.mouse.down();
    await this.page.waitForTimeout(70);
    await this.page.mouse.up();
  }

  async type(loc: Locator, text: string, opts: { clear?: boolean; enter?: boolean } = {}) {
    await this.click(loc);
    if (opts.clear !== false) {
      await this.page.keyboard.press("Control+A");
    }
    for (const ch of text) {
      await this.page.keyboard.type(ch);
      await this.page.waitForTimeout(40 + ((ch.charCodeAt(0) * 7) % 31)); // 40-70 ms, deterministic
    }
    if (opts.enter) await this.page.keyboard.press("Enter");
  }

  async key(k: string, pause = 0) {
    // shortcuts are ignored while a control has focus (sliders, inputs): blur first, like a user clicking away
    await this.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
    await this.page.keyboard.press(k);
    if (pause) await this.page.waitForTimeout(pause);
  }

  /** smooth drag from (x1,y1) to (x2,y2) */
  async drag(x1: number, y1: number, x2: number, y2: number, ms = 900) {
    await this.moveTo(x1, y1);
    await this.page.mouse.down();
    await this.page.waitForTimeout(80);
    await this.moveTo(x2, y2, ms);
    await this.page.waitForTimeout(80);
    await this.page.mouse.up();
  }

  /** orbit the 3D view: drag in a gentle horizontal arc on the canvas */
  async orbit(dx: number, dy = 0, ms = 1400) {
    const c = (await this.page.locator("canvas").first().boundingBox())!;
    const x = c.x + c.width * 0.62, y = c.y + c.height * 0.5;
    await this.drag(x, y, x + dx, y + dy, ms);
  }

  async wheel(x: number, y: number, dy: number, steps = 12) {
    await this.moveTo(x, y);
    for (let i = 0; i < steps; i++) {
      await this.page.mouse.wheel(0, dy / steps);
      await this.page.waitForTimeout(30);
    }
  }

  /** smooth scroll (eased) of the nearest scrollable ancestor so that `loc` sits `offset` px below its top */
  async scrollTo(loc: Locator, offset = 80, ms = 900) {
    await loc.evaluate(
      (el, [off, dur]) =>
        new Promise<void>((res) => {
          let sc: HTMLElement | null = el.parentElement;
          while (sc && !(/(auto|scroll)/.test(getComputedStyle(sc).overflowY) && sc.scrollHeight > sc.clientHeight + 2)) sc = sc.parentElement;
          if (!sc) return res();
          const box = sc;
          const from = box.scrollTop;
          const to = Math.max(0, Math.min(box.scrollHeight - box.clientHeight, from + el.getBoundingClientRect().top - box.getBoundingClientRect().top - off));
          const t0 = performance.now();
          const f = (now: number) => {
            const k = Math.min(1, (now - t0) / dur);
            const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
            box.scrollTop = from + (to - from) * e;
            if (k < 1) requestAnimationFrame(f);
            else res();
          };
          requestAnimationFrame(f);
        }),
      [offset, ms] as const,
    );
  }

  /** open the patient overview dock (it starts closed on every load) */
  async openDock(animate = true) {
    const t = this.page.getByRole("button", { name: "Toggle patient overview" });
    if ((await t.getAttribute("aria-expanded")) === "true") return;
    if (animate) await this.click(t);
    else await t.click();
    await this.page.getByRole("searchbox", { name: "Search measurements" }).waitFor({ state: "visible" });
  }

  async anchor(name: string) {
    return this.page.evaluate((n) => (window as unknown as { __cardiolens: { projectAnchor: (n: string) => { x: number; y: number } | null } }).__cardiolens.projectAnchor(n), name);
  }

  async hoverAnchor(name: string, dx = 0, dy = 0) {
    const p = await this.anchor(name);
    if (!p) throw new Error(`${this.id}: anchor ${name} not found`);
    await this.moveTo(p.x + dx, p.y + dy);
    return p;
  }

  /** park the cursor somewhere neutral (or hide it) */
  async park(x = 1890, y = 1060) {
    await this.moveTo(x, y);
  }

  async hideCursor(hidden = true) {
    await this.page.evaluate((h) => { const c = document.getElementById("__cap_cursor"); if (c) c.style.opacity = h ? "0" : "1"; }, hidden);
  }

  // ---------- finish ----------
  async end() {
    await this.until(this.length + HANDLE);
    this.recording = false;
    await this.cdp.send("Page.stopScreencast").catch(() => {});
    await Promise.all(this.writes);
    this.encode();
  }

  private encode() {
    const fr = this.frames;
    if (fr.length < 2) throw new Error(`${this.id}: no frames captured`);
    // picture time of each frame: ts - (t0 - HANDLE); clip starts at -HANDLE
    const startTs = this.t0 - HANDLE;
    const endTs = this.t0 + this.length + HANDLE;
    const lines: string[] = [];
    const usable = fr.filter((f) => f.ts <= endTs);
    for (let i = 0; i < usable.length; i++) {
      const a = Math.max(usable[i]!.ts, startTs);
      const b = i + 1 < usable.length ? usable[i + 1]!.ts : endTs;
      if (b <= startTs) continue;
      lines.push(`file '${usable[i]!.file.replace(/\\/g, "/")}'`, `duration ${Math.max(0.001, b - a).toFixed(5)}`);
    }
    lines.push(`file '${usable[usable.length - 1]!.file.replace(/\\/g, "/")}'`);
    const list = path.join(this.dir, "frames.txt");
    fs.writeFileSync(list, lines.join("\n"));
    const out = path.join(VIDEO, "raw", `${this.clip}.mp4`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-vf", "fps=30,format=yuv420p",
      "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-movflags", "+faststart", out]);
    const meta = {
      id: this.id, clip: this.clip, file: `raw/${this.clip}.mp4`, handle: HANDLE, lead: this.lead, tail: this.tail,
      voice: this.voice.duration, length: +this.length.toFixed(3), frames: fr.length, marks: this.marks,
    };
    fs.writeFileSync(path.join(VIDEO, "raw", `${this.clip}.json`), JSON.stringify(meta, null, 1));
    fs.rmSync(path.join(this.dir, "frames"), { recursive: true, force: true });
  }
}

/** Declare one captured scene. `body` runs the shot; the browser context is fresh for every scene. */
export function scene(id: string, body: (d: Director) => Promise<void>, ctxOpts: { width?: number; height?: number; isMobile?: boolean; hasTouch?: boolean; clip?: string } = {}) {
  test(ctxOpts.clip ?? id, async ({ browser }) => {
    test.setTimeout(240_000);
    const ctx = await browser.newContext({
      viewport: { width: ctxOpts.width ?? 1920, height: ctxOpts.height ?? 1080 },
      deviceScaleFactor: 1,
      isMobile: ctxOpts.isMobile,
      hasTouch: ctxOpts.hasTouch,
      reducedMotion: "no-preference",
      colorScheme: "dark",
    });
    const page = await ctx.newPage();
    const d = new Director(id, ctxOpts.clip);
    await d.init(ctx, page);
    try {
      await body(d);
    } finally {
      await ctx.close();
    }
  });
}
