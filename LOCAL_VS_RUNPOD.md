# ⚖️ Local vs RunPod — measured comparison & pros/cons

Two real runs of the **same** job — 50 `concept_reveal` clips, 1920×1080, 150
frames each, from one Remotion `<Composition>`:

- **Local:** 50 *course* concepts on an Apple M1 Max — see [`PERFORMANCE.md`](./PERFORMANCE.md).
- **RunPod:** 50 *MCP* concepts on RunPod serverless GPU, worker image on ghcr,
  clips uploaded to Azure Blob — see [`RUNPOD.md`](./RUNPOD.md).

> **Verdict:** For **50 short DOM/CSS clips, local wins** — it was *faster
> end-to-end* and free. RunPod's cold-start + per-job overhead dominates jobs
> this small, and a fast laptop matches a single GPU worker per clip. RunPod
> pulls ahead only at **hundreds+ of clips** (fan-out throughput) or when you
> must not tie up your machine / don't have a capable local box.

---

## 1. Measured numbers

| | **Local (M1 Max)** | **RunPod serverless** |
|---|---|---|
| Clips | 50 | 50 |
| Resolution / frames | 1920×1080 · 150f | identical |
| **Total wall-clock** | **181.7 s (~3 min)** | **~15–20 min** (much slower here)¹ |
| Per-clip compute | ~3.6 s | ~3–6 s (similar per clip) |
| Startup tax | 0.7 s (bundle, once) | **~2 min cold image pull** (1 GB, first worker) |
| Parallelism | serial (1.44 of 10 cores used) | bursty; scaler did **not** fan out to 20 |
| Throughput (measured) | 16.5 clips/min | **2.4–10 clips/min** (bursty)¹ |
| Peak RAM | 743 MB | per-worker (cloud, irrelevant locally) |
| CPU cycles (measured) | 66.5 B | n/a (offloaded) |
| **Marginal cost** | **$0** | **~$0.10–0.50 / batch**² |
| Machine tied up? | yes, ~3 min | no |
| Setup required | none | image build + push, endpoint, secrets, bucket |

¹ **Measured live on this run.** Two timestamped samples: 30→34 clips over 101 s
= **2.4 clips/min** in the tail; the early burst (0→30) was faster (~8–10/min).
RunPod's autoscaler stayed conservative for a 50-clip burst — it never fanned
out to 20 workers — so end-to-end this was **~5–6× slower than local**, mostly
cold-start + scale-up latency, not render time. ² Illustrative; verify current
RunPod GPU-second pricing.

## 2. Why local was faster here

These templates are **DOM + CSS + SVG with no WebGL** — the render is bound by
headless Chromium + CPU h264 encode, *not* the GPU. So:

- A single cloud GPU worker renders one clip in roughly the same time as the M1
  Max (~3–6 s) — **no per-clip speedup** from the GPU.
- RunPod adds overhead local doesn't have: a **cold image pull** (~2 min for the
  first worker on a 1 GB image), per-job queue/scheduling, and network upload of
  each MP4 to Azure.
- Local pays its bundle cost **once** (0.7 s) and then streams clips at 3.6 s
  each with zero network round-trips.

RunPod's advantage is **horizontal scale**, which 50 short clips don't stress.
At 500+ clips the fan-out (20+ workers in parallel) turns a ~30 min local serial
grind into a few minutes — that's where it flips.

## 3. Cost

- **Local:** $0 marginal. You already own the machine; the run costs a few
  watt-hours of electricity. Downside is opportunity cost — the laptop is busy.
- **RunPod:** billed GPU-seconds × workers. ~50 clips × ~5 s ≈ 250–300
  GPU-seconds + cold-start seconds ⇒ cents per batch. Plus the always-on cost if
  you keep Min-workers ≥ 1 to avoid cold starts, plus Azure egress (tiny). Cheap
  in absolute terms, but **not cheaper than free** for a batch this size.

---

## 4. Pros & cons

### 🖥️ Local (`batch-render.mjs`)

**Pros**
- **Free** — no per-render cost.
- **Zero setup** — `node batch-render.mjs` and go; no image, endpoint, secrets, or bucket.
- **Fastest for small/medium batches** — bundle once, ~3.6 s/clip, no network or cold start.
- **Instant iteration** — pairs with `remotion studio` for live preview.
- **Outputs are right there** on disk; nothing to download.
- **No secrets/credentials** to manage or leak.

**Cons**
- **Serial / single-machine** — throughput capped by your cores; ties up the laptop.
- **Doesn't scale** — 500+ clips becomes a long grind (~30+ min).
- **Depends on your hardware** — slow/old machine = slow renders.
- **Repo bloat** if you commit the MP4s (the local 50 added ~26 MB).

### ☁️ RunPod serverless GPU (`runpod-submit.mjs` + worker image)

**Pros**
- **Massively parallel** — fan 50 / 500 / 5,000 jobs across a worker pool; wall-clock barely grows with batch size.
- **Frees your machine** — renders happen in the cloud; outputs land in object storage.
- **Elastic** — scale workers to 0 when idle, up to N during a run; pay only for what you use.
- **Reproducible & shareable** — the worker image bakes the bundle; anyone can submit jobs.
- **Clips auto-published** — uploaded straight to a public URL (here, Azure `$web`).

**Cons**
- **Cold starts hurt short jobs** — a ~2 min image pull dwarfs a 5 s render unless you keep warm workers.
- **No per-clip speedup** for these 2D/DOM scenes — the GPU is largely idle; you're paying for parallelism, not raw speed.
- **Real setup & moving parts** — registry image, endpoint, GPU choice, env secrets, storage bucket, CORS/public-access.
- **Costs money** and needs accounts/billing.
- **Secret management** — connection strings / API keys must be handled carefully (use a vault, never paste them around).
- **Harder to debug** — failures surface in worker logs, not your terminal.

---

## 5. Which to use

| Situation | Use |
|---|---|
| Iterating / previewing one animation | **Local** (`remotion studio`) |
| A handful → ~100 finals | **Local** (`batch-render.mjs`) — free, minutes |
| Hundreds–thousands of clips | **RunPod** fan-out — parallel, machine stays free |
| Slow/old local hardware | **RunPod** even for small batches |
| Part of an automated cloud pipeline | **RunPod** (jobs from a server, outputs to a bucket) |
| One-off, offline, or cost-sensitive | **Local** |

**Pattern that uses both:** author + preview **locally**, mass-render on
**RunPod**. The shared `inputProps` contract guarantees identical output either
way — see [`ARCHITECTURE.md`](./ARCHITECTURE.md).
