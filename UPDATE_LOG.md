# 📋 Update Log — worked examples of changing this bundle

Real, dated records of changes to `src/`, kept as **worked examples** of the
[`DEVELOPING.md`](./DEVELOPING.md) process. Use these as a template for future
edits: what changed, how it was verified, and every propagation step taken.

---

## 2026-06-29 — Fix `comparison` headline overlap

**Goal:** the top headline overlapped the two comparison panels. Make the panels
sit **below** the headline; keep the slide-in, the winner lift, and the green
outline.

### Diagnosis
`<Stage>` is an `AbsoluteFill` (flex column). The title was
`position: absolute; top: 70`, while the panels rendered from the **top of the
flex stage** (y≈0) — so the panel titles collided with the headline.

### Change (`src/Main.tsx`, `Comparison`)
Put the panels in their own absolutely-positioned region **below** the headline,
top-aligned so the gap is small:

```tsx
<div style={{ position: "absolute", top: 70, left: 0, right: 0, textAlign: "center", … }}>{p.title}</div>
<div style={{ position: "absolute", top: 180, left: 0, right: 0, bottom: 60,
             display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
  <div style={{ display: "flex", width: "88%", gap: 40, padding: 40, alignItems: "stretch" }}>
    {panel("left", left, lX)} <divider/> {panel("right", right, rX)}
  </div>
</div>
```
- v1 used `top: 200` + `alignItems: center` → fixed overlap but left a big gap
  under the headline.
- v2 (shipped) uses `top: 180` + `alignItems: flex-start` per review feedback
  ("move panels up, less gap").

### Steps taken (the propagation checklist in action)
1. **Edited** `Comparison` in `src/Main.tsx`.
2. **Local render** + frame check (no studio needed):
   ```bash
   npx remotion render src/index.ts Main out/comparison_fixed.mp4 --props=/tmp/cmp.json
   ffmpeg -i out/comparison_fixed.mp4 -vf "select=eq(n\,45)"  -frames:v 1 f45.png
   ffmpeg -i out/comparison_fixed.mp4 -vf "select=eq(n\,140)" -frames:v 1 f140.png
   ```
   Verified frame 45 (slide-in) and 140 (winner lifted) — headline clear of panels.
3. **Review gate:** opened the clip in Chrome, got approval. Feedback → tightened
   the gap (v2), re-rendered, re-verified, approved.
4. **Re-rendered the published gallery clip** so `index.html` shows the fix:
   ```bash
   npx remotion render src/index.ts Main samples/comparison.mp4 --props=/tmp/cmp.json
   ffmpeg -ss 2 -i samples/comparison.mp4 -frames:v 1 -vf scale=640:-2 samples/posters/comparison.jpg
   ```
5. **Redeployed the Azure `serveUrl` bundle** (for prebuilt-bundle consumers):
   ```bash
   ./deploy-bundle.sh    # → https://dpremotionbundle.z33.web.core.windows.net/
   ```
6. **Rebuilt + repushed the RunPod worker image** (it bakes the bundle, so this is
   mandatory for any `src/` change):
   ```bash
   docker buildx build --platform linux/amd64 -f runpod/Dockerfile \
     -t ghcr.io/rifaterdemsahin/claude-animations-runpod:latest --push .
   ```
7. **Committed + pushed** `src/Main.tsx`, `samples/comparison.mp4`,
   `samples/posters/comparison.jpg`, and this log → GitHub Pages redeploys.

### Manual step left to the operator
- **Refresh RunPod workers** so they pull the new `:latest` image: endpoint
  `s13kv6t2jg78lk` → set Min workers `0 → 1` (or release workers). New workers
  pull automatically; a warm worker would keep the old image.

### Result
Headline cleanly separated from the panels at all frames; winner lift + green
outline intact. Verified locally and in the published `samples/comparison.mp4`.

---

### Template for the next change
1. Edit `src/Main.tsx` → 2. local render + frame/Chrome check → 3. review/approve
→ 4. re-render published clips (`samples/`, batches) → 5. `./deploy-bundle.sh`
→ 6. rebuild+push RunPod image → 7. commit+push → 8. refresh RunPod workers.
(Full rationale + skip-able cases: [`DEVELOPING.md`](./DEVELOPING.md) §D.)
