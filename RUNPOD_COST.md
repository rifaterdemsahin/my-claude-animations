# 💸 RunPod — expected cost

What it actually costs to render these animations on RunPod serverless, with a
worked model you can re-run against current prices. Pairs with
[`LOCAL_VS_RUNPOD.md`](./LOCAL_VS_RUNPOD.md) (local is **$0** marginal) and
[`PERFORMANCE_RATIONALE.md`](./PERFORMANCE_RATIONALE.md) (why these clips are
CPU-bound, so the **cheapest GPU is the right choice**).

> ⚠️ **Prices change — verify before budgeting.** Figures below are *illustrative
> orders of magnitude* using a representative **cheap GPU at ≈ $0.0002 / GPU-second
> (≈ $0.72 / hr)**. Check live rates: <https://www.runpod.io/pricing>.

---

## How RunPod serverless billing works

- You pay **per GPU-second a worker is running**, summed across workers — **not**
  per job. Running 20 workers in parallel finishes faster but costs the *same
  total* GPU-seconds as 1 worker (you buy **time**, not lower total cost).
- **Cold starts are billed too:** the seconds a fresh worker spends pulling the
  ~1 GB image and booting count as running time. For 5-second renders this is the
  dominant cost driver (see below).
- **Idle/active (min) workers are billed while kept warm** — that's the price of
  avoiding cold starts.
- Pick the **cheapest GPU that fits** — these scenes are Chromium/CPU-bound, so a
  bigger GPU costs more for **zero** speedup.

### The formula

```
batch_cost ≈ (N × per_clip_seconds × rate)            ← compute
           + (cold_workers × cold_start_seconds × rate) ← cold-start tax
           + (warm_workers × idle_seconds × rate)        ← kept-warm tax (optional)
           + storage + egress                            ← usually pennies
```

Per-unit values used below (illustrative):

| Quantity | Value |
|---|---|
| GPU rate (cheap tier) | $0.0002 / s (≈ $0.72 / hr) |
| Render per clip | ~5–6 s |
| **Compute per clip** | **≈ $0.0012** |
| Cold start (image pull + boot) | ~120 s ⇒ **≈ $0.024 per cold worker** |
| Warm worker kept idle | **≈ $0.72 / hr each** |

---

## Expected cost by batch size

Assuming warm workers (Min ≥ 1) so cold starts are amortized:

| Batch | Compute | + cold starts | **≈ Total** | vs local |
|---|---|---|---|---|
| **1 clip** (cold) | $0.0012 | ~$0.024 | **~$0.03** | local: $0 |
| **50 clips** | $0.06 | 1–2 starts (~$0.05) | **~$0.10–0.15** | local: $0, ~3 min |
| **500 clips** (20 workers) | $0.60 | ~$0.48 | **~$1.10** | local: $0, ~30 min serial |
| **5,000 clips** | $6.00 | ~$0.50 | **~$6.50** | local: hours, machine pinned |

> This matches our real 50-clip MCP run: a few cents of compute, dominated by
> cold-start/scale-up time — **~$0.10–0.50** end to end.

### The cost of *keeping workers warm*

To kill cold-start latency you keep Min workers ≥ 1, which bills even when idle:

| Warm workers | Idle cost |
|---|---|
| 1 | ~$0.72 / hr |
| 5 | ~$3.60 / hr |
| 20 | ~$14.40 / hr |

**So:** keep workers warm only for the **duration of a render session**, then
scale Min back to 0. A warm pool left on overnight costs far more than the
renders themselves.

---

## Where the money goes (and doesn't)

- **Dominant for small batches:** cold starts. A 5 s render behind a ~120 s image
  pull is ~96% overhead. Mitigate by keeping a warm worker *during the run* and/or
  **batching several clips per job** so one boot serves many renders.
- **Negligible:** Azure Blob storage + egress. 50 clips ≈ ~25 MB; a whole 5,000-
  clip library is a few GB — cents of storage, and egress for MP4 playback is
  small (and free-tier friendly on most plans).
- **Zero benefit, real cost:** a premium GPU. These are DOM/CSS/SVG + CPU h264 —
  the GPU sits idle. Paying for a 4090/A100 just raises the per-second rate.

---

## Cost-control checklist

- ✅ **Cheapest GPU tier** that boots the image (16–24 GB is plenty).
- ✅ **Min workers ≥ 1 only during a run**, then back to 0.
- ✅ **Batch multiple clips per job** to amortize the cold-start tax.
- ✅ **Same region** for endpoint + Azure storage to keep egress free/cheap.
- ✅ **Reuse the `:latest` image** (it bakes the bundle) — only rebuild on a
  `src/`/Remotion change, so workers don't re-pull needlessly.
- ✅ For **tens of clips, just render locally** — it's free and finishes in
  minutes (see [`LOCAL_VS_RUNPOD.md`](./LOCAL_VS_RUNPOD.md)).

---

## When RunPod is worth the spend

| Volume | Recommendation |
|---|---|
| 1–100 clips | **Local** — $0, minutes, no setup |
| 100s–1,000s of clips | **RunPod** — ~$1–7, parallel, machine stays free |
| Continuous pipeline / on-demand from an app | **RunPod** — pay-per-use, scales to 0 when idle |

**Bottom line:** for this project's typical batches, RunPod costs **roughly
$1–3 for a full course-sized batch** and only earns its keep at scale or when you
can't tie up a machine. For a handful of clips, local is both cheaper (free) and
faster. Always confirm current GPU rates before committing a budget.
