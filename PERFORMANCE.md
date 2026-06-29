# 📊 Performance Report — 50× `concept_reveal`, local render

**Workload:** render 50 `concept_reveal` clips for the *Claude AI Architect*
course from one `<Composition id="Main">`, varying only `inputProps`.
**Method:** bundle once, then `renderMedia` per clip (`batch-render.mjs`, the
recommended path from [`ARCHITECTURE.md`](./ARCHITECTURE.md) §3).
**Date:** 2026-06-29 · **Reproducible:** `node batch-render.mjs` against
[`batch/manifest.json`](./batch/manifest.json).

---

## 1. Machine

| | |
|---|---|
| Model | Apple **M1 Max** |
| Cores | 10 (8 performance + 2 efficiency) |
| Node | v22.22.0 |
| Remotion | 4.0.484 |
| Renderer | headless Chrome (`chrome-headless-shell`) + h264 (CPU) |

## 2. Workload

| | |
|---|---|
| Clips | **50** (all `animationType: "concept_reveal"`) |
| Resolution / fps | 1920×1080 @ 30 fps |
| Frames per clip | 150 (5.0 s) |
| **Total frames rendered** | **7,500** |
| Output | 50× h264 MP4, **26 MB total** (~520 KB avg) |

## 3. Headline results

| Metric | Value |
|--------|-------|
| **Total wall-clock** | **181.7 s** (≈ 3 min 2 s) |
| ├─ bundle (once) | 0.7 s |
| └─ render (50 clips) | 181.0 s |
| **Per clip** | **≈ 3.62 s** |
| **Throughput** | **16.5 clips/min · 41.2 frames/s** |

> One clip on its own measured 4.78 s (with a fresh bundle each time). Bundling
> **once** for the batch drops the marginal cost to ~3.6 s/clip — the bundle
> tax is paid a single time instead of 50×.

## 4. CPU

Measured with `/usr/bin/time -l` on the Node render process over the full run:

| Metric | Value |
|--------|-------|
| Real (wall) | 181.94 s |
| User CPU | 218.25 s |
| Sys CPU | 44.12 s |
| **Total CPU time** | **262.37 CPU-seconds** |
| **Avg CPU utilization** | **≈ 1.44 cores** (144% of one core) |
| **Cycles elapsed** | **66.5 billion** |
| **Instructions retired** | **82.4 billion** |
| IPC (instructions / cycle) | ≈ 1.24 |

**Reading these numbers.** The render is only mildly parallel (~1.4 cores busy
on average) because clips run one after another and each `concept_reveal` is a
light DOM/CSS scene — there's little to parallelize per frame. Plenty of CPU
headroom was left on the 10-core chip; the lever for *more speed* is **rendering
several clips concurrently** (see §7), not a faster single clip.

> **Scope caveat.** `/usr/bin/time -l` counts the **Node process only**. Remotion
> renders frames inside helper `chrome-headless-shell` processes whose CPU,
> cycles, and instructions are **not** included above — so true total compute is
> somewhat higher than the counter values. User CPU time (262 s) is the better
> proxy for "work done" than the raw cycle counter.

## 5. Memory

| Metric | Value |
|--------|-------|
| **Max resident set size** (Node proc) | **743 MB** |
| Peak memory footprint (`phys_footprint`, Node) | 327 MB |
| Headless-Chrome helpers | a handful of extra processes, tens of MB each |

Peak RAM is **roughly constant whether you render 10 or 50 clips serially** —
each clip is rendered and released before the next starts, so memory does not
accumulate across the batch. Comfortable on a 16 GB machine with large margin.

> Whole-process-tree RAM was hard to pin precisely because the headless-Chrome
> helpers are short-lived and reparented; the 743 MB Node high-water mark is the
> reliable, dominant figure. Budget **~1 GB per concurrent render** when
> planning parallelism (§7).

## 6. Per-clip economics

| | |
|---|---|
| Marginal cost per clip | **$0** (local hardware + electricity) |
| Energy (rough) | 262 CPU-s on M1 Max ≈ a few watt-hours — negligible |
| Machine availability | pinned for ~3 min; usable for light work alongside |

For 50 clips, **local is the obvious choice**: free, finished in 3 minutes, no
cloud setup. The cloud (RunPod) only wins past the point where serial local time
becomes painful — hundreds of clips — where fan-out turns ~40 min into ~3 min.
See [`ARCHITECTURE.md`](./ARCHITECTURE.md) §4–§6.

## 7. How to go faster locally

This run was **serial** (one `renderMedia` at a time) and used ~1.4 of 10 cores.
The headroom is in **concurrency**:

- Run N `renderMedia` calls in parallel with `Promise.all` in small groups.
  Budget **~1 GB RAM + ~1.5 cores per concurrent clip** → ~4–6 in flight fits a
  16 GB / 10-core M1 Max comfortably.
- Expectation: 4× concurrency → roughly **45–60 s** for the same 50 clips
  (sub-linear, due to CPU/RAM contention and shared encode).
- Beyond that, returns flatten — at which point **RunPod fan-out** (§ ARCHITECTURE)
  is the next step.

## 8. Raw measurements

```
# batch-render.mjs (bundle once, render 50)
bundle ready in 0.7s
✅ 50 clips in 181.7s (bundle 0.7s + render 181.0s ≈ 3.62s/clip)

# /usr/bin/time -l node batch-render.mjs   (Node process)
      181.94 real       218.25 user        44.12 sys
           778764288  maximum resident set size      # 743 MB
         82385811772  instructions retired           # 82.4 B
         66494869811  cycles elapsed                 # 66.5 B
           342529072  peak memory footprint          # 327 MB

# output
50 files, 26 MB total, batch/concept_reveal/*.mp4
```

---

*Rendered samples are published in [`batch.html`](./batch.html) ·
gallery of all 10 templates in [`index.html`](./index.html).*
