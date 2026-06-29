// batch-render.mjs — render every variation in batch/manifest.json from the
// single <Composition id="Main">. Bundles ONCE, then reuses that bundle for all
// renders (the fast way to do volume locally — see ARCHITECTURE.md §3).
//
//   node batch-render.mjs
//
// Must run from the project root so the @remotion/* imports resolve.
import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia } from "@remotion/renderer";
import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("batch/manifest.json", "utf8"));
const t0 = Date.now();

console.log(`▶️  bundling once…`);
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const tBundled = Date.now();
console.log(`   bundle ready in ${((tBundled - t0) / 1000).toFixed(1)}s`);

let i = 0;
for (const { out, props } of manifest) {
  const composition = await selectComposition({ serveUrl, id: "Main", inputProps: props });
  await renderMedia({ serveUrl, composition, codec: "h264", outputLocation: out, inputProps: props });
  i++;
  process.stdout.write(`\r   rendered ${i}/${manifest.length}`);
}

const tDone = Date.now();
console.log(
  `\n✅ ${manifest.length} clips in ${((tDone - t0) / 1000).toFixed(1)}s` +
  ` (bundle ${((tBundled - t0) / 1000).toFixed(1)}s` +
  ` + render ${((tDone - tBundled) / 1000).toFixed(1)}s` +
  ` ≈ ${((tDone - tBundled) / manifest.length / 1000).toFixed(2)}s/clip)`
);
