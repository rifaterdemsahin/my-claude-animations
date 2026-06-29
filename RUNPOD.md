# 🚀 RUNPOD.md — render the 50 MCP concept reveals on RunPod

This renders [`batch-mcp/manifest.json`](./batch-mcp/manifest.json) (50
`concept_reveal` clips about **MCP**) on **RunPod serverless GPU** instead of
your laptop. RunPod fans the 50 jobs out across a worker pool, so the whole batch
finishes in a couple of minutes regardless of your machine.

> **What I (Claude) already built for you:** the 50-clip manifest, the worker
> image ([`runpod/Dockerfile`](./runpod/Dockerfile) + [`handler.py`](./runpod/handler.py)
> + [`render-one.mjs`](./runpod/render-one.mjs)), the job submitter
> ([`runpod-submit.mjs`](./runpod-submit.mjs)), and the gallery page
> ([`batch_inrunpod.html`](./batch_inrunpod.html)).
>
> **What only you can do** (needs *your* account, billing, and secrets — I won't
> handle credentials or create accounts): the 6 steps below.

---

## Architecture of this run

```
manifest.json ──► runpod-submit.mjs ──► RunPod endpoint ──► N GPU workers
   (50 jobs)         (your laptop)         (your image)      render in parallel
                                                                  │
                                          each worker uploads ────┘
                                          mp4 → S3/R2 bucket ──► PUBLIC_BASE_URL
                                                                  │
                          batch_inrunpod.html reads outputs.json ◄┘  & plays them
```

The worker uses the bundle **baked into the image** at build time, so jobs don't
re-bundle. One job = one clip = `{ "props": {...}, "out": "mcp_01.mp4" }`.

---

## Prerequisites (one-time)

- A **RunPod** account with billing enabled, and an **API key**
  (RunPod console → Settings → API Keys).
- A **Docker Hub** (or other registry) account to host the worker image.
- An **S3-compatible bucket** with public read — **Cloudflare R2** (has a free
  tier and a public `*.r2.dev` URL) or **AWS S3**. You need: endpoint URL,
  bucket name, access key id, secret key, and the public base URL it serves from.

---

## Step 1 — Build & push the worker image

From the **repo root** (the Docker build context must see `src/`):

```bash
docker build -f runpod/Dockerfile -t YOURUSER/claude-animations-runpod:latest .
docker push YOURUSER/claude-animations-runpod:latest
```

> Build on/for **linux/amd64** if you're on Apple silicon:
> `docker buildx build --platform linux/amd64 -f runpod/Dockerfile -t YOURUSER/claude-animations-runpod:latest --push .`

## Step 2 — Create a RunPod serverless endpoint

RunPod console → **Serverless** → **New Endpoint**:

- **Container image:** `YOURUSER/claude-animations-runpod:latest`
- **GPU:** the cheapest tier is plenty — these are DOM/CSS/SVG scenes, the
  bottleneck is Chromium/CPU, not the GPU (a 16–24 GB card is fine).
- **Workers:** Max = `20` (or more) for real fan-out; Min = `0` (or `1` to avoid
  cold starts during the run).
- Note the **Endpoint ID**.

## Step 3 — Set the bucket secrets on the endpoint

Add these as **environment variables / secrets** on the endpoint (they're read by
[`handler.py`](./runpod/handler.py)):

| Var | Example | Notes |
|-----|---------|-------|
| `S3_ENDPOINT` | `https://<acct>.r2.cloudflarestorage.com` | R2 or `https://s3.<region>.amazonaws.com` |
| `S3_BUCKET` | `claude-animations` | bucket name |
| `S3_ACCESS_KEY_ID` | `...` | |
| `S3_SECRET_KEY` | `...` | |
| `S3_PREFIX` | `mcp` | key prefix (default `mcp`) |
| `PUBLIC_BASE_URL` | `https://pub-xxxx.r2.dev` | public base, **no trailing slash** |

The final public URL of a clip will be `PUBLIC_BASE_URL/S3_PREFIX/mcp_NN.mp4`.

## Step 4 — Submit the 50 jobs

From the repo root on your laptop:

```bash
RUNPOD_API_KEY=your_key \
RUNPOD_ENDPOINT_ID=your_endpoint_id \
CONCURRENCY=10 \
node runpod-submit.mjs
```

It POSTs one job per manifest entry, polls each to completion, and writes the
public URLs to **`batch-mcp/outputs.json`**.

## Step 5 — Wire the page to your bucket

Either commit `batch-mcp/outputs.json` (the page auto-loads it if present), **or**
just set the base URL once near the top of
[`batch_inrunpod.html`](./batch_inrunpod.html):

```js
const OUTPUT_BASE_URL = "https://pub-xxxx.r2.dev/mcp"; // PUBLIC_BASE_URL + "/" + S3_PREFIX
```

Until then the page shows each clip as **⏳ Awaiting RunPod render** over its
local preview poster — so it's still a useful gallery before you run anything.

## Step 6 — Publish

```bash
git add batch-mcp/outputs.json batch_inrunpod.html
git commit -m "MCP batch rendered on RunPod"
git push
```

The page goes live at
`https://rifaterdemsahin.github.io/my-claude-animations/batch_inrunpod.html`.

---

## What to expect — performance & cost

Compared with the local 50-clip run (see [`PERFORMANCE.md`](./PERFORMANCE.md):
~182 s serial on an M1 Max), on RunPod:

| | Local M1 Max (serial) | RunPod, 20 workers |
|---|---|---|
| Wall-clock, 50 clips | ~182 s | **~1–2 min** (incl. cold starts) |
| Per-clip compute | ~3.6 s | ~3–6 s + cold start |
| Marginal cost | $0 | **~$0.10–0.50** for the batch¹ |

¹ Illustrative — verify current RunPod pricing. Cost = billed GPU-seconds ×
rate; cold starts dominate short jobs, so keep Min-workers ≥ 1 during the run or
the per-job startup tax outweighs the 5-second render. For just **50** clips,
local is honestly cheaper and simpler; RunPod earns its keep at **hundreds+** of
clips or when you don't want to tie up your machine. Full reasoning in
[`ARCHITECTURE.md`](./ARCHITECTURE.md) §4–§6.

---

## Troubleshooting

- **Jobs FAIL immediately** → check the endpoint logs; usually a missing `S3_*`
  secret or a bucket-permissions error.
- **Chrome/render errors** → the image already installs the headless-Chrome libs
  and runs `remotion browser ensure`; if you slimmed the Dockerfile, re-add the
  `libnss3 … libasound2` line.
- **Page shows ⏳ forever** → `OUTPUT_BASE_URL` is unset *and* `outputs.json` is
  missing/empty, or the bucket isn't public. Open one clip URL directly to test.
- **CORS / won't play** → enable public read + permissive CORS on the bucket.
