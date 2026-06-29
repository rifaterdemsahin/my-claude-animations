# 🧰 Developing — add / update animations & bump Remotion

How to change this bundle safely: **add a new animation type**, **edit an
existing one**, or **upgrade Remotion** — and, crucially, the **propagation
steps** so the change actually reaches everywhere it's rendered (local, the
deployed Azure `serveUrl`, and the RunPod worker image).

> **The golden rule:** the bundle is consumed in three places — local renders,
> the prebuilt Azure `serveUrl`, and the **baked-into-image** RunPod worker. Any
> change to `src/` (or the Remotion version) must be **re-deployed to Azure** and
> **the RunPod image rebuilt+repushed**, or those consumers keep running the old
> code.

---

## Where things live

| File | Role |
|---|---|
| [`src/Main.tsx`](./src/Main.tsx) | all animation components + the `DISPATCH` map (slug → component) |
| [`src/Root.tsx`](./src/Root.tsx) | registers `<Composition id="Main">` + `defaultProps` |
| [`src/index.ts`](./src/index.ts) | `registerRoot` entry |
| shared helpers in `Main.tsx` | `Stage`, `center`, `FONT_HEAD`, `FONT_BODY`, `clamp` |
| Remotion API used | `useCurrentFrame`, `useVideoConfig`, `interpolate`, `spring`, `Easing`, `AbsoluteFill`, `Sequence` |

---

## A. Add a new animation type

### 1. Write the component (in `src/Main.tsx`)
Follow the existing pattern: read **everything from `props`** (never hard-code
copy), drive motion from `useCurrentFrame()`, and wrap in `<Stage>`.

```tsx
// ── 11. quote_card ─────────────────────────────────────────────────────────
const QuoteCard: React.FC<any> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 14 }, durationInFrames: 20 });
  const op = interpolate(enter, [0, 1], [0, 1]);
  return (
    <Stage bgColor={p.bgColor}>
      <div style={{ ...center, width: "100%", padding: 120, opacity: op,
        transform: `translateY(${interpolate(enter, [0, 1], [40, 0])}px)` }}>
        <div style={{ fontFamily: FONT_HEAD, fontWeight: 800, fontSize: 96, color: p.brandColor }}>
          “{p.quote}”
        </div>
        {p.author ? <div style={{ marginTop: 28, fontSize: 40, color: "#9ca3af" }}>— {p.author}</div> : null}
      </div>
    </Stage>
  );
};
```

### 2. Register it in the `DISPATCH` map (bottom of `Main.tsx`)
```ts
const DISPATCH: Record<string, React.FC<any>> = {
  // …existing 10…
  quote_card: QuoteCard,   // ← add your slug
};
```
That's all the wiring — `Main` reads `props.animationType` and looks it up here.

### 3. Preview it live
```bash
npm run studio        # http://localhost:3000
```
Pick the `Main` composition, set `animationType: "quote_card"` + your fields in
the props panel, scrub the timeline.

### 4. Render a test clip locally
```bash
npx remotion render src/index.ts Main out/quote.mp4 \
  --props='{"animationType":"quote_card","quote":"Tools extend what Claude can do","author":"Docs","brandColor":"#8b5cf6","secondaryColor":"#3b82f6","bgColor":"#030712"}'
```

### 5. Document the new props
- Add a row to the **10-type table** in [`README.md`](./README.md) and the
  `inputProps` table in [`CONSUMING.md`](./CONSUMING.md) §5.
- If a Go server feeds this bundle, mirror the fields in its
  `animationDefaultProps()` (the props contract — see `cmd/server/main.go` in the
  parent project). **Keep them identical** or local/cloud output diverges.

### 6. Propagate (so cloud renders use it too) — see the checklist below.

---

## B. Update an existing animation type

1. Edit its component in `src/Main.tsx` (e.g. tweak `ConceptReveal`).
2. `npm run studio` to eyeball it, then render a test clip (as in A.4).
3. If you changed/renamed any prop, **update the docs and the Go contract** so
   callers send the new shape.
4. **Propagate** (checklist below) and **re-render any published clips** that use
   this type — e.g. re-run `node batch-render.mjs` / the RunPod batch so the
   `batch/` and `batch-mcp/` outputs reflect the change.

> Renaming or removing a prop is a **breaking change** for anything already
> sending the old props (the Go server, saved manifests, external API callers).
> Prefer additive changes; if you must rename, version it and update all callers.

---

## C. Upgrade the Remotion version

Remotion ships `remotion` **and** the `@remotion/*` packages — they **must all be
the exact same version**, or rendering breaks.

```bash
# bump remotion + every @remotion/* together
npx remotion upgrade          # easiest: updates them in lockstep
# or manually set the same version for: remotion, @remotion/cli, @remotion/bundler,
# @remotion/renderer (and any others) in package.json, then:
npm install
```

Then:
1. `npm run studio` — confirm it still previews.
2. Render one clip of each type (or `node batch-render.mjs`) — confirm no errors.
3. **Propagate** (checklist) — redeploy the Azure bundle and rebuild the RunPod
   image so cloud renders use the new Remotion.
4. Commit `package.json` **and** `package-lock.json` together.

> The RunPod `Dockerfile` runs `npx remotion browser ensure` at build time, so a
> rebuilt image picks up a compatible headless-Chrome automatically — no separate
> browser step needed.

---

## D. Propagation checklist (do this after ANY `src/` or version change)

| Step | Command | Why |
|---|---|---|
| 1. Preview | `npm run studio` | catch visual/runtime errors early |
| 2. Local render | `npx remotion render src/index.ts Main out/x.mp4 --props=…` | confirm it renders headless |
| 3. Redeploy Azure bundle | `./deploy-bundle.sh` | updates the prebuilt `serveUrl` (`dpremotionbundle…`) consumers use |
| 4. Rebuild + push RunPod image | `docker buildx build --platform linux/amd64 -f runpod/Dockerfile -t ghcr.io/rifaterdemsahin/claude-animations-runpod:latest --push .` | the worker bakes the bundle at build time — old image = old animations |
| 5. Refresh RunPod workers | endpoint → Min workers 0 → 1 (or release) | force workers to pull the new `:latest` image |
| 6. Update docs/contract | README + CONSUMING §5 + Go `animationDefaultProps()` | callers know the new props |
| 7. Re-render published clips | `node batch-render.mjs` / RunPod batch | `batch/` + `batch-mcp/` reflect the change |
| 8. Commit + push | `git add -A && git commit && git push` | code + lockfile + docs together |

**Skip-able when:** a pure docs/page edit (no `src/` change) only needs steps 6–8.
A change that's *only* rendered locally can skip 3–5. But if you use RunPod, the
**image rebuild (step 4) is mandatory** for any `src/` or Remotion change.

---

## E. Conventions to keep

- **Read everything from `props`** — no hard-coded sentence text; that's what lets
  one composition render every variation.
- **Reuse the shared brand props** (`brandColor`, `secondaryColor`, `bgColor`,
  `fps`, `durationInFrames`) and the `Stage`/`center`/`FONT_*` helpers so new
  types match the look.
- **Animate from `useCurrentFrame()`** with `spring`/`interpolate`; clamp with
  `extrapolateLeft/Right: "clamp"` so motion holds at the ends.
- **Keep the slug stable** once published — external API callers and saved
  manifests reference `animationType` by slug.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full system and
[`CONSUMING.md`](./CONSUMING.md) for how callers send props.
