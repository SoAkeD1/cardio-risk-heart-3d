# Record your own narration

The video currently uses an AI voice. To swap in your own voice:

1. For each `<scene>.txt` in this folder, read the text aloud and save it here as `<scene>.wav`
   (same name, e.g. `s05d_live.wav`). Phone or headset is fine; a quiet room matters more than the mic.
2. Read calmly (about 145 words per minute). Each file states the target length. Within ±15 % is fine.
3. Leave about half a second of silence at the start and end. Don't add music.
4. Run:

   ```
   python video/make_video.py --own-voice --skip-capture
   ```

   Each WAV is cleaned automatically (denoise, 80 Hz high-pass, de-ess, compression, loudness), and the cut
   re-times itself to your recording. Scenes without a WAV keep the AI voice.

If your read is much slower or faster than the target, re-capture too (drop `--skip-capture`) so the on-screen
actions land on your words.
