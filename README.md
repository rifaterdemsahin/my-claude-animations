# 🎞️ my-claude-animations

> Remotion bundle for the **[Claude AI Certification for Architects](https://github.com/rifaterdemsahin/claude-architect-certification)** Animation Generator. One `<Composition id="Main">` renders all 10 course-content animation types by reading `animationType` from `props` — so a single bundle renders every sentence in every style.

**Live bundle (Phase 2 — deployed):** `https://dpremotionbundle.z33.web.core.windows.net/`
**Local render proof (Phase 1):** all 10 types render to 1920×1080 h264 MP4 ✅

---

## 🧩 Structure

```
src/
├── Main.tsx    # all 10 animation components + the dispatcher (reads props.animationType)
├── Root.tsx    # registers <Composition id="Main"> with concept_reveal defaultProps
└── index.ts    # registerRoot entry
deploy-bundle.sh  # rebuild + redeploy the bundle to Azure static web (Phase 2)
```

## ▶️ Quickstart

```bash
npm install                          # ~9s, 187 deps
npx remotion studio                  # live preview at http://localhost:3000

# render one MP4 (concept_reveal is the default — props optional)
npx remotion render src/index.ts Main out/concept_reveal.mp4

# render any of the 10 types by setting animationType + that type's props.
# Tip: use a JSON file instead of inline --props to avoid shell-escaping bugs.
cat > /tmp/props.json <<'EOF'
{"animationType":"code_typing","title":"Code Typing","code":"const x = 1;","caption":"setup","durationInFrames":180}
EOF
npx remotion render src/index.ts Main out/code_typing.mp4 --props=/tmp/props.json
```

## 🎨 The 10 animation types

| Slug | Reads from props | Default `durationInFrames` |
|------|------------------|---------------------------|
| `architecture_diagram` | `nodes[{id,label,x,y}]`, `activeNode` | 150 |
| `data_flow` | `stages[]` | 150 |
| `code_typing` | `code`, `language`, `caption` | 180 |
| `concept_reveal` | `title`, `subtitle` | 120 |
| `timeline` | `milestones[{at,label}]` | 150 |
| `comparison` | `left/right {title,points[]}`, `winner` | 150 |
| `process_steps` | `steps[{n,title}]` | 102 |
| `metric_counter` | `target`, `prefix`, `suffix`, `decimals`, `caption` | 120 |
| `flowchart` | `nodes[{id,type,label,y}]`, `edges[{from,to,label}]` | 180 |
| `callout_zoom` | `image`, `focusPoint{x,y}`, `zoom`, `callout` | 120 |

Every component also reads the shared brand props: `brandColor` (`#8b5cf6`), `secondaryColor` (`#3b82f6`), `bgColor` (`#030712`), `fps`, `durationInFrames`.

## 🔗 Props contract

The props this bundle consumes match **exactly** the `animationDefaultProps()` function in the parent project's `cmd/server/main.go` — the Go server's RunPod render payload feeds these straight into `inputProps`. No drift between local render and serverless render.

## 🚀 Phase 2 — deploy the bundle

```bash
./deploy-bundle.sh
```

Requires `az` CLI logged in (reads the storage key at runtime — no secret in this repo). The serve URL (`https://dpremotionbundle.z33.web.windows.net/`) never changes; only the files under the `$web` container change.

See the parent project's [`4_Formula/tools/remotion_azure_bundle_deploy.md`](https://github.com/rifaterdemsahin/claude-architect-certification/blob/main/4_Formula/tools/remotion_azure_bundle_deploy.md) for the full Azure recipe.

## ✅ Phase 1 verification (2026-06-29)

All 10 types rendered locally to 1920×1080 h264 MP4 using the server's exact `inputProps`:

```
architecture_diagram.mp4   callout_zoom.mp4      code_typing.mp4
comparison.mp4             concept_reveal.mp4    data_flow.mp4
flowchart.mp4              metric_counter.mp4    process_steps.mp4
timeline.mp4
```

## 📚 Related

- Parent project: [claude-architect-certification](https://github.com/rifaterdemsahin/claude-architect-certification)
- Animation Generator page: [`5_Symbols/production/postprod/animation_generator.html`](https://github.com/rifaterdemsahin/claude-architect-certification/blob/main/5_Symbols/production/postprod/animation_generator.html)
- Setup guide: [`4_Formula/tools/remotion_runpod_setup.md`](https://github.com/rifaterdemsahin/claude-architect-certification/blob/main/4_Formula/tools/remotion_runpod_setup.md)
- Remotion docs: <https://www.remotion.dev/docs>
