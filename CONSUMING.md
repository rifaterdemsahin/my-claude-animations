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

**This is how an external app should call this project.** You deploy the worker
once (see [`RUNPOD.md`](./RUNPOD.md)), and then your app talks to a plain HTTP
endpoint — **you call RunPod directly**, no SDK required. Each request renders
one clip and the worker uploads it to your bucket; the job result is the public
MP4 URL.

### How the call process works

```
your app ─POST /run {input:{props,out}}─►  RunPod endpoint
   │                                            │ (queues, a worker wakes)
   │  ◄──────────── { "id": "JOB" } ────────────┘
   │
   │  GET /status/JOB  (poll every ~2–3s)
   │  ◄── { "status": "IN_QUEUE" | "IN_PROGRESS" }      ← keep polling
   │  ◄── { "status": "COMPLETED", "output": {           ← done
   │          "url": "https://claudecertstore.z13.web.core.windows.net/mcp/hello.mp4",
   │          "key": "mcp/hello.mp4", "out": "hello.mp4" } }
   ▼
 use output.url  (the rendered MP4, already public)
```

- **Base URL:** `https://api.runpod.ai/v2/<ENDPOINT_ID>` (this project's endpoint
  is `s13kv6t2jg78lk`).
- **Auth:** header `Authorization: Bearer <RUNPOD_API_KEY>`.
- **Request body:** `{"input": { "props": <inputProps>, "out": "<filename>.mp4" }}`
  — `props` is any payload from §5; `out` is the blob filename to write.
- **Routes:** `POST /run` (async, returns a job id) · `POST /runsync` (waits and
  returns the result inline) · `GET /status/{id}` · `POST /cancel/{id}` ·
  `GET /health` (worker counts).
- **Job status values:** `IN_QUEUE` → `IN_PROGRESS` → `COMPLETED` (or `FAILED`).

### Option A — async: submit, then poll (recommended)

**1) Submit the job**
```bash
curl -X POST https://api.runpod.ai/v2/s13kv6t2jg78lk/run \
  -H "Authorization: Bearer $RUNPOD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
        "input": {
          "props": { "animationType": "concept_reveal",
                     "title": "MCP is an open protocol",
                     "subtitle": "Foundations",
                     "brandColor": "#8b5cf6", "secondaryColor": "#3b82f6", "bgColor": "#030712" },
          "out": "hello.mp4"
        }
      }'
# → {"id":"c80f...-e1","status":"IN_QUEUE"}
```

**2) Poll until done**
```bash
curl https://api.runpod.ai/v2/s13kv6t2jg78lk/status/c80f...-e1 \
  -H "Authorization: Bearer $RUNPOD_API_KEY"
# → {"status":"COMPLETED","output":{"url":"https://claudecertstore.z13.web.core.windows.net/mcp/hello.mp4","key":"mcp/hello.mp4","out":"hello.mp4"}}
```

### Option B — synchronous: one call, wait for the URL

Simplest for a single short clip — `runsync` blocks until the render finishes
(subject to RunPod's sync timeout). Good for "render one and show it now":

```bash
curl -X POST https://api.runpod.ai/v2/s13kv6t2jg78lk/runsync \
  -H "Authorization: Bearer $RUNPOD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input":{"props":{"animationType":"metric_counter","target":200,"suffix":"K","caption":"tokens of context"},"out":"ctx.mp4"}}'
# → {"status":"COMPLETED","output":{"url":"https://…/mcp/ctx.mp4", ...}}
```

### From Node (fetch) — submit + poll

```js
const EP = "s13kv6t2jg78lk";
const H = { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RUNPOD_API_KEY}` };

async function renderClip(props, out) {
  const run = await fetch(`https://api.runpod.ai/v2/${EP}/run`, {
    method: "POST", headers: H, body: JSON.stringify({ input: { props, out } }),
  }).then(r => r.json());

  for (;;) {                                   // poll
    await new Promise(r => setTimeout(r, 2500));
    const s = await fetch(`https://api.runpod.ai/v2/${EP}/status/${run.id}`, { headers: H }).then(r => r.json());
    if (s.status === "COMPLETED") return s.output.url;
    if (s.status === "FAILED") throw new Error(JSON.stringify(s));
  }
}

const url = await renderClip(
  { animationType: "concept_reveal", title: "Tools extend Claude" }, "tools.mp4");
console.log("rendered:", url);
```

### From Python (requests) — submit + poll

```python
import os, time, requests

EP = "s13kv6t2jg78lk"
H = {"Authorization": f"Bearer {os.environ['RUNPOD_API_KEY']}", "Content-Type": "application/json"}

def render_clip(props, out):
    job = requests.post(f"https://api.runpod.ai/v2/{EP}/run",
                        json={"input": {"props": props, "out": out}}, headers=H).json()
    while True:
        time.sleep(2.5)
        s = requests.get(f"https://api.runpod.ai/v2/{EP}/status/{job['id']}", headers=H).json()
        if s["status"] == "COMPLETED":
            return s["output"]["url"]
        if s["status"] == "FAILED":
            raise RuntimeError(s)

print(render_clip({"animationType": "timeline", "title": "Models",
                   "milestones": [{"at": 20, "label": "Haiku"}, {"at": 80, "label": "Opus"}]}, "models.mp4"))
```

### Many clips at once

To render a whole set, submit all jobs first, then poll them — RunPod runs them
across its worker pool in parallel. [`runpod-submit.mjs`](./runpod-submit.mjs) is
a ready-made batch submitter (reads a manifest, bounded concurrency, writes the
result URLs to a JSON file).

### Practical notes
- **Cold start:** the first job after idle waits ~1–2 min while a worker pulls
  the image. Keep **Min workers ≥ 1** for latency-sensitive apps.
- **Don't ship the API key to browsers.** If your *frontend* needs clips, have
  *your* backend call RunPod (key server-side) and hand the resulting URL to the
  client — don't expose `RUNPOD_API_KEY` in client code.
- **`out` controls the filename** in the bucket; the public URL is
  `PUBLIC_BASE_URL/AZURE_PREFIX/<out>` (configured on the endpoint).

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
