# CardioLens demo video

A ~9½-minute YouTube demo (Track A deliverable), built entirely from code: real captures of the running app,
code-drawn cards that read their numbers from the repo's artifacts, narration, captions, loudness-normalised mix.

```
python video/make_video.py                  # voice → capture → terminals → assemble → render → loudnorm → QA
python video/make_video.py --skip-capture   # reuse video/raw/
python video/make_video.py --own-voice      # use your recordings in video/voice/record_here/
```

Prerequisites: the project `.venv` + `pip install -r video/requirements.txt`, Node 20+, `npm install` in `video/`
and `video/editor/`, ffmpeg, Microsoft Edge, optionally Blender. The app must be running on :8000, built with test
hooks: `CARDIOLENS_TEST_HOOKS=1 python scripts/build.py`, then `python -m app.backend.main`.

| Step | Code | Output |
|---|---|---|
| Script (source of truth) | `NARRATION.md` (scenes, cues `{name}`, numbers `[[name]]` from `facts.json`) | — |
| Voice | `pipeline/tts.py` (edge-tts `en-US-AndrewNeural`, −5 %, word timings → cue times) | `voice/out/*.wav/json` |
| Capture | `capture/*.spec.ts` + `capture/lib.ts` (headless Edge + GPU, CDP screencast, eased cursor, actions on cue) | `raw/*.mp4` |
| Terminal clips | `make_video.py terminals()` (real command output) | `qa/term_*.txt` |
| Assemble | `pipeline/assemble.py` (timeline, captions, SRT, on-screen data from `artifacts/`) | `editor/src/*.gen.json`, `out/cardiolens.srt` |
| Edit | `editor/` (Remotion 4.0.530: `Master`, one `Chapter<N>` per chapter, `Thumbnail`) | `out/master_raw.mp4` |
| Mix | two-pass `loudnorm` −14 LUFS / −1 dBTP, AAC 192 kbps, faststart | `out/cardiolens_demo_1080p.mp4` |
| QA | `pipeline/qa.py` (duration, coverage, frames every 10 s + contact sheet, loudness, silences) | `qa/`, `COVERAGE.md`, `STORYBOARD.md`, `out/youtube_description.md` |

Docs: `FEATURE_INVENTORY.md` (every feature, importance A/B/C), `STORYBOARD.md` and `COVERAGE.md` (generated from the
render timeline), `NARRATION.md`. No music is used: no calm track with a documented licence was available.
