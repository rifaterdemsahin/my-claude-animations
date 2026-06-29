# 🔌 Consuming this project from another app

This repo is a **Remotion render bundle**: one `<Composition id="Main">` that
renders any of **10 animation types** by reading `animationType` (+ that type's
fields) from `inputProps`. Nothing in here is a server by itself — you *drive* it
from your app. There are four ways to do that, from "embed live in a webpage" to
"call a cloud HTTP API."

> **The one contract you need:** build an `inputProps` object (see §5 for every
> type's schema) and hand it to whichever renderer you pick below. The output is
> deterministic — the same props always produce the same frames.

```
your app ──build inputProps──► [ renderer ] ──► MP4 / live <Player>
                                   ▲
        pick one:  Player (live in browser) · @remotion/renderer (Node) ·
                   RunPod HTTP API (any language) · prebuilt serveUrl bundle
```

---

## 1. Live in a browser — `@remotion/player` (no pre-render)

Best when your app is React and you want the animation to play **interactively**,
no MP4 files. Install Remotion + the player, import the composition, feed props.

```bash
npm i @remotion/player remotion react react-dom
```

```tsx
import { Player } from "@remotion/player";
import { Main } from "my-claude-animations/src/Main"; // or copy Main.tsx in

export function Preview() {
  return (
    <Player
      component={Main}
      durationInFrames={150}
      fps={30}
      compositionWidth={1920}
      compositionHeight={1080}
      controls
      inputProps={{
        animationType: "concept_reveal",
        title: "Claude is an AI assistant",
        subtitle: "Foundations",
        brandColor: "#8b5cf6", secondaryColor: "#3b82f6", bgColor: "#030712",
      }}
    />
  );
}
```

Change `inputProps.animationType` (+ that type's fields) to switch animations
live. No files, no build server — it renders in the user's browser.

## 2. Render MP4s in Node — `@remotion/renderer` (programmatic)

Best for a backend/CLI that produces video files. Bundle once, render many — see
[`batch-render.mjs`](./batch-render.mjs) for the working example.

```bash
npm i @remotion/bundler @remotion/renderer
```

```js
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia } from "@remotion/renderer";
import path from "node:path";

const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") }); // once
const inputProps = { animationType: "metric_counter", target: 200, suffix: "K", caption: "tokens" };

const composition = await selectComposition({ serveUrl, id: "Main", inputProps });
await renderMedia({ serveUrl, composition, codec: "h264", outputLocation: "out/clip.mp4", inputProps });
```

You can also render a **single still** with `renderStill(...)` for thumbnails.

## 3. Cloud HTTP API — RunPod serverless (any language)

Best for scale or when your app isn't Node. Deploy the worker once (see
[`RUNPOD.md`](./RUNPOD.md) / [`RUNPOD_WALKTHROUGH.md`](./RUNPOD_WALKTHROUGH.md)),
then **any app in any language** submits a job over HTTP and gets back a URL.

```bash
curl -X POST https://api.runpod.ai/v2/<ENDPOINT_ID>/run \
  -H "Authorization: Bearer $RUNPOD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input":{"props":{"animationType":"concept_reveal","title":"Hello"},"out":"hello.mp4"}}'
# → { "id": "..." }  then poll /status/{id}  → { "output": { "url": "https://…/mcp/hello.mp4" } }
```

The worker renders the clip and uploads it to your bucket; the job output is the
public URL. [`runpod-submit.mjs`](./runpod-submit.mjs) shows batching + polling.

## 4. Point a renderer at the prebuilt `serveUrl` (skip bundling)

The bundle is also deployed as static files. Instead of `bundle(...)` in §2, pass
the deployed URL as `serveUrl` so you never bundle in your app:

```js
const serveUrl = "https://dpremotionbundle.z33.web.core.windows.net/"; // prebuilt bundle
const composition = await selectComposition({ serveUrl, id: "Main", inputProps });
await renderMedia({ serveUrl, composition, codec: "h264", outputLocation: "out.mp4", inputProps });
```

Re-deploy the bundle (`./deploy-bundle.sh`) only when `src/` changes.

---

## 5. The `inputProps` contract — all 10 types

Every type also accepts the shared brand props (defaults shown):
`brandColor` `#8b5cf6`, `secondaryColor` `#3b82f6`, `bgColor` `#030712`,
`fps` `30`, `durationInFrames` (see per-type default). Set `animationType` to one
of the slugs below and add that type's fields.

| `animationType` | Fields | Example `inputProps` |
|---|---|---|
| `concept_reveal` | `title`, `subtitle` | `{"animationType":"concept_reveal","title":"Claude is an AI assistant","subtitle":"Foundations"}` |
| `code_typing` | `code`, `caption` | `{"animationType":"code_typing","code":"const x = 1;\nawait run(x);","caption":"setup"}` |
| `process_steps` | `title`, `steps:[{n,title}]` | `{"animationType":"process_steps","title":"How it flows","steps":[{"n":1,"title":"Tokenize"},{"n":2,"title":"Generate"}]}` |
| `metric_counter` | `target`, `prefix`, `suffix`, `decimals`, `caption` | `{"animationType":"metric_counter","target":200,"suffix":"K","caption":"tokens of context"}` |
| `timeline` | `title`, `milestones:[{at,label}]` | `{"animationType":"timeline","title":"Models","milestones":[{"at":20,"label":"Haiku"},{"at":80,"label":"Opus"}]}` |
| `comparison` | `title`, `left/right:{title,points[]}`, `winner` | `{"animationType":"comparison","title":"A vs B","winner":"left","left":{"title":"Prompting","points":["Fast"]},"right":{"title":"Fine-tuning","points":["Slow"]}}` |
| `data_flow` | `title`, `stages:[]` | `{"animationType":"data_flow","title":"Pipeline","stages":["Prompt","Model","Response"]}` |
| `architecture_diagram` | `title`, `nodes:[{id,label,x,y}]`, `activeNode` | `{"animationType":"architecture_diagram","title":"Agent","activeNode":"model","nodes":[{"id":"model","label":"Claude","x":960,"y":400}]}` |
| `flowchart` | `title`, `nodes:[{id,type,label,y}]`, `edges:[{from,to}]` | `{"animationType":"flowchart","title":"Loop","nodes":[{"id":"a","type":"process","label":"Start","y":300},{"id":"b","type":"decision","label":"Done?","y":600}],"edges":[{"from":"a","to":"b"}]}` |
| `callout_zoom` | `callout`, `focusPoint:{x,y}`, `zoom` | `{"animationType":"callout_zoom","callout":"Look here","zoom":2.2,"focusPoint":{"x":0.4,"y":0.5}}` |

> Node `x`/`y` are in 1920×1080 pixel space; `focusPoint`/`milestone.at` are
> 0–1 / 0–100 ratios. Full field behaviour lives in [`src/Main.tsx`](./src/Main.tsx);
> ready-to-run examples are in [`batch/manifest.json`](./batch/manifest.json) and
> [`batch-mcp/manifest.json`](./batch-mcp/manifest.json).

---

## 6. Which path should *my* app use?

| Your app… | Use |
|---|---|
| is a React web app, wants live preview | **§1 Player** — no files, instant |
| is a Node backend producing video files | **§2 `@remotion/renderer`** |
| isn't Node / needs to scale to many clips | **§3 RunPod HTTP API** |
| wants to render but never bundle | **§4 prebuilt `serveUrl`** |

Whatever you pick, you only ever construct the **same `inputProps`** (§5). That
contract is the integration surface — see [`ARCHITECTURE.md`](./ARCHITECTURE.md)
for how the pieces fit and [`PERFORMANCE_RATIONALE.md`](./PERFORMANCE_RATIONALE.md)
for local-vs-cloud trade-offs.
