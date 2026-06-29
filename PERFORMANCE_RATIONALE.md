# 🧠 Performance Rationale — *why* the numbers are what they are

This explains the **causes** behind the measured results in
[`PERFORMANCE.md`](./PERFORMANCE.md) (local) and
[`LOCAL_VS_RUNPOD.md`](./LOCAL_VS_RUNPOD.md) (cloud). The numbers are easy to
read; the *reasoning* is what tells you how to make decisions.

> **One-sentence thesis:** these animations are **CPU/Chromium-bound, not
> GPU-bound, and each clip takes only seconds** — so the dominant cost is
> *fixed overhead* (bundling, process launch, cold image pulls, scheduling), and
> the winning strategy is to **pay fixed costs once and avoid network/cold-start
> tax** — which is exactly why bundling-once locally beat fanning-out on RunPod
> for a 50-clip batch.

---

## The measured facts (recap)

| | Local M1 Max | RunPod (this run) |
|---|---|---|
| 50 clips wall-clock | 181.7 s (~3 min) | ~15–20 min |
| Per clip | 3.62 s | 3–6 s (similar) |
| Bundle / startup | 0.7 s once | ~2 min cold image pull |
| CPU | 262 CPU-s · ~1.44 of 10 cores | offloaded |
| Cycles · IPC | 66.5 B · 1.24 | — |
| Peak RAM | 743 MB | per-worker |
| Cost | $0 | ~$0.10–0.50 |

Everything below explains **why** each of these landed where it did.

---

## 1. Why ~3.6 s per clip (and why bundling once matters)

A single clip rendered in isolation took **4.78 s**, but in the batch each clip
cost only **3.62 s**. The difference is the **bundle step**.

- Rendering = bundle the React/Remotion code → launch headless Chromium → render
  150 frames → encode h264.
- The bundle is **identical for all 50 clips** (same `<Composition>`; only
  `inputProps` change). Doing it per clip repeats ~1 s of webpack work 50×.
- `batch-render.mjs` bundles **once** (0.7 s total) and reuses it, so the
  marginal cost drops to just "launch + render + encode" ≈ 3.6 s.

**Rationale:** *separate the fixed cost from the per-item cost, and pay the fixed
cost once.* This single decision is why 50 clips took 3 min instead of ~4 min,
and it's the same reason the RunPod image **pre-bundles at build time** so jobs
don't re-bundle.

## 2. Why only ~1.44 of 10 cores were busy

Total CPU time was 262 s over 182 s wall-clock → average **~1.44 cores**. On a
10-core machine that looks like waste, but it's expected:

- The batch renders **serially** — one `renderMedia` at a time.
- Each `concept_reveal` is a **light DOM/CSS/SVG scene**: a headline, a fade, an
  underline wipe. There's little per-frame work to spread across cores, and the
  h264 encode is only moderately threaded.
- So each clip uses ~1–1.5 cores and the rest sit idle.

**Rationale:** the bottleneck is **latency per clip**, not CPU saturation. That's
why the lever for "go faster locally" is **concurrency** (run 4–6 clips at once
to fill the idle cores), not a bigger CPU — and it's why a GPU does nothing here
(§4). The idle headroom is the signal that this workload is *serial-overhead*
bound.

## 3. Why IPC ≈ 1.24 and 66.5 B cycles

66.5 B cycles retired 82.4 B instructions → **1.24 instructions/cycle**. That's a
modest IPC, and it fits the work profile:

- Rendering is **branchy, pointer-chasing work** — JS execution, DOM layout,
  style resolution, rasterization — not tight numeric loops that hit 3–4 IPC.
- Lots of memory access and small allocations → cache/branch stalls keep IPC
  around 1.

**Rationale:** this confirms the work is **general-purpose CPU** work, the kind a
fast out-of-order core (Apple silicon) does well and a GPU can't accelerate.
It's the quantitative fingerprint of a non-vectorizable, non-GPU workload.

## 4. Why the GPU gives **zero** per-clip speedup (the big one)

This is the crux of why RunPod didn't render each clip faster:

- These templates use **DOM + CSS + SVG**. There is **no WebGL, no 3D, no shader,
  no heavy compositing**.
- Such scenes are rasterized by Chromium on the **CPU**, and h264 encoding here
  is **libx264 on the CPU**. The GPU is essentially idle.
- A GPU only helps Remotion when the scene is GPU-bound (WebGL/3D/large
  composited effects) or when you use hardware-accelerated encode.

**Rationale:** picking "a GPU" for this job buys you **parallel machines**, not
**faster machines**. A single cloud GPU worker renders one clip in ~the same
3–6 s as the M1 Max. So RunPod can only win by running **many clips at once** —
which a 50-clip batch barely exercises (§6).

## 5. Why peak RAM stayed ~constant (743 MB)

RAM did **not** grow with batch size because rendering is serial: each clip is
rendered and its Chromium torn down before the next starts. Memory is released
between clips, so 10 clips and 50 clips peak at the same ~743 MB (Node) plus a
transient headless-Chrome helper.

**Rationale:** this is what makes **bounded concurrency** safe — budget ~1 GB per
*simultaneous* render and you can predict how many fit in RAM (e.g., ~6 on a
16 GB machine), independent of total batch size.

## 6. Why local beat RunPod for 50 clips — and where it flips

Model the two wall-clocks:

```
local_serial   ≈ bundle_once + N × per_clip
               ≈ 0.7 s + 50 × 3.6 s ≈ 182 s   ✅ matches measured

runpod_total   ≈ cold_pull + queue/scheduling + (N / workers) × per_clip + upload
               ≈ ~120 s + … + (50 / few) × ~5 s + …  ≈ 15–20 min (measured)
```

Two things hurt RunPod for a small batch:

1. **Cold start dominates short jobs.** A ~2-minute pull of the 1 GB image is
   already most of local's *entire* runtime, before a single frame renders.
2. **The autoscaler stayed conservative.** Serverless scalers ramp workers based
   on sustained queue depth; 50 five-second jobs drain faster than the scaler
   decides to spin up 20 workers, so effective parallelism was low (measured
   **2.4–10 clips/min**, not the 50-wide fan-out the model would allow).

**The crossover:** RunPod wins when `N × per_clip` (serial local time) grows much
larger than the cloud's fixed overhead — i.e. **hundreds to thousands of clips**,
where dividing the work across 20+ warm workers turns a ~30–60 min local grind
into a few minutes. For tens of clips, the fixed overhead is the whole story and
**local wins**.

**Rationale for the design:** keep workers **warm** (Min ≥ 1) and **batch many
clips per job** to amortize cold start; pick the **cheapest GPU** (the GPU is
idle anyway). These directly attack the two costs above.

## 7. Why the output is identical either way

Both paths feed the **same `inputProps`** into the **same `<Composition id="Main">`**
(the contract in [`ARCHITECTURE.md`](./ARCHITECTURE.md)). Rendering is
deterministic, so a clip rendered locally and on RunPod are byte-for-byte
equivalent in content.

**Rationale:** this is what makes the "**author + preview locally, mass-render in
the cloud**" pattern safe — you're never trading correctness for scale, only
wall-clock and cost.

---

## TL;DR decision rule

- **Tens of clips, or iterating?** Render **locally** — fixed overhead is the
  whole cost, and local has almost none. Free, ~3 min.
- **Hundreds+ of clips, or can't tie up your machine?** Render on **RunPod** with
  warm workers and batched jobs — parallel fan-out amortizes the fixed overhead.
- **Either way:** bundle once, keep the GPU expectations realistic (these are
  CPU scenes), and exploit concurrency rather than hoping for a faster single
  render.
