// render-one.mjs — render ONE clip inside the RunPod worker, against the bundle
// that was pre-built into the image at /app/out (so no network bundling per job).
//
//   node render-one.mjs '<inputProps-json>' /tmp/out.mp4
//
// Kept tiny on purpose: the handler shells out to this once per job.
import { selectComposition, renderMedia } from "@remotion/renderer";

const props = JSON.parse(process.argv[2]);
const out = process.argv[3];
const serveUrl = process.env.SERVE_URL || "/app/out"; // local pre-built bundle dir

const composition = await selectComposition({ serveUrl, id: "Main", inputProps: props });
await renderMedia({
  serveUrl,
  composition,
  codec: "h264",
  outputLocation: out,
  inputProps: props,
  // chromiumOptions: { gl: "angle" }, // uncomment to use the GPU on a GPU pod
});
console.error("rendered", out);
