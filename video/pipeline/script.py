"""Parse video/NARRATION.md into scenes (id, chapter, visual, lead, tail, spoken text, cue char offsets)."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

VIDEO = Path(__file__).resolve().parents[1]
CUE = re.compile(r"\{([a-z0-9_]+)\}")
VAR = re.compile(r"\[\[([a-z0-9_]+)\]\]")


@dataclass
class Scene:
    id: str
    title: str
    chapter: int
    visual: str
    lead: float
    tail: float
    raw: str
    text: str = ""
    cues: dict[str, int] = field(default_factory=dict)  # cue name -> char offset in `text`


def load_facts() -> dict:
    p = VIDEO / "facts.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def parse(path: Path | None = None) -> list[Scene]:
    src = (path or VIDEO / "NARRATION.md").read_text(encoding="utf-8")
    facts = load_facts()
    scenes: list[Scene] = []
    for block in re.split(r"^## ", src, flags=re.M)[1:]:
        head, *lines = block.splitlines()
        sid, _, title = head.partition(" · ")
        meta = dict(re.findall(r"^- (\w+): (.+)$", "\n".join(lines), flags=re.M))
        raw = " ".join(l[2:].strip() for l in lines if l.startswith("> "))

        def sub(m: re.Match) -> str:
            k = m.group(1)
            if k not in facts:
                raise KeyError(f"{sid}: [[{k}]] has no value in video/facts.json")
            return str(facts[k])

        raw = VAR.sub(sub, raw)
        sc = Scene(sid.strip(), title.strip(), int(meta["chapter"]), meta["visual"].strip(),
                   float(meta.get("lead", 0.4)), float(meta.get("tail", 0.8)), raw)
        out, pos = [], 0
        for m in CUE.finditer(raw):
            out.append(raw[pos:m.start()])
            sc.cues[m.group(1)] = len("".join(out))
            pos = m.end()
        out.append(raw[pos:])
        sc.text = re.sub(r"\s+", " ", "".join(out)).strip()
        scenes.append(sc)
    return scenes


if __name__ == "__main__":
    total = 0
    for s in parse():
        n = len(s.text.split())
        total += n
        print(f"{s.id:18s} ch{s.chapter} {n:4d} words  cues={list(s.cues)}")
    print("total words:", total)
