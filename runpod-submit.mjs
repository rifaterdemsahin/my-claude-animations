// runpod-submit.mjs — submit every entry in batch-mcp/manifest.json to a RunPod
// serverless endpoint, poll until each finishes, and write the resulting public
// URLs to batch-mcp/outputs.json (which batch_inrunpod.html can read).
//
//   RUNPOD_API_KEY=...  RUNPOD_ENDPOINT_ID=...  node runpod-submit.mjs
//
// Optional: CONCURRENCY=10 (how many jobs to keep in flight at once).
//
// The endpoint must be running the image built from runpod/Dockerfile, with the
// S3_* / PUBLIC_BASE_URL secrets set (see RUNPOD.md). RunPod renders the jobs in
// parallel across its worker pool — that is why this finishes a big batch fast.
import { readFileSync, writeFileSync } from "node:fs";

const API_KEY = process.env.RUNPOD_API_KEY;
const ENDPOINT = process.env.RUNPOD_ENDPOINT_ID;
const CONCURRENCY = Number(process.env.CONCURRENCY || 10);
if (!API_KEY || !ENDPOINT) {
  console.error("Set RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID. See RUNPOD.md.");
  process.exit(1);
}

const BASE = `https://api.runpod.ai/v2/${ENDPOINT}`;
const HEAD = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
const rows = JSON.parse(readFileSync("batch-mcp/manifest.json", "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runOne(row) {
  // 1. submit async job
  const res = await fetch(`${BASE}/run`, {
    method: "POST",
    headers: HEAD,
    body: JSON.stringify({ input: { props: row.props, out: row.out } }),
  });
  if (!res.ok) throw new Error(`run ${row.id}: HTTP ${res.status} ${await res.text()}`);
  const { id } = await res.json();

  // 2. poll status
  for (;;) {
    await sleep(2500);
    const s = await fetch(`${BASE}/status/${id}`, { headers: HEAD });
    const j = await s.json();
    if (j.status === "COMPLETED") return { id: row.id, out: row.out, ...j.output };
    if (j.status === "FAILED" || j.status === "CANCELLED") {
      throw new Error(`${row.id} ${j.status}: ${JSON.stringify(j.error || j)}`);
    }
  }
}

// simple concurrency pool
const results = [];
let cursor = 0, done = 0;
async function worker() {
  while (cursor < rows.length) {
    const row = rows[cursor++];
    try {
      const r = await runOne(row);
      results.push(r);
      process.stdout.write(`\r  done ${++done}/${rows.length}`);
    } catch (e) {
      console.error(`\n  ✗ ${row.id}: ${e.message}`);
      done++;
    }
  }
}

const t0 = Date.now();
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
results.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync("batch-mcp/outputs.json", JSON.stringify(results, null, 2));
console.log(
  `\n✅ ${results.length}/${rows.length} clips in ${((Date.now() - t0) / 1000).toFixed(1)}s` +
  ` → batch-mcp/outputs.json`
);
