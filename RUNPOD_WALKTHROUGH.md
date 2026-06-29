# 🛠️ How we actually got RunPod working — step by step

[`RUNPOD.md`](./RUNPOD.md) is the clean recipe. **This is the real build log** —
the exact sequence we ran, *including the problems we hit and how we fixed them*,
so the next person doesn't relearn them the hard way.

End result: 50 `concept_reveal` clips about MCP, rendered on RunPod serverless,
uploaded to Azure Blob, live at
[`batch_inrunpod.html`](https://rifaterdemsahin.github.io/my-claude-animations/batch_inrunpod.html).

---

## The path that worked

### 1. Build the worker image — and validate it before trusting it
- Wrote `runpod/Dockerfile` (Node + headless-Chrome libs + **pre-built bundle** +
  Python `runpod` SDK), `runpod/handler.py`, `runpod/render-one.mjs`.
- **Validated locally first** with a native-arch build (`--load`, no push) — fast
  way to catch Dockerfile bugs without waiting on a push.
- **Smoke-tested the render *inside* the container** (`docker run --entrypoint
  node … render-one.mjs …`) → produced a real 285 KB MP4. This proved the
  riskiest part (headless Chrome libs in the image) before any cloud step.

> **Lesson:** validate the image + an in-container render locally before pushing.
> A green build ≠ a working render.

### 2. Push to ghcr.io — the auth gotcha
- Chose GitHub Container Registry (`ghcr.io/rifaterdemsahin/claude-animations-runpod`).
- **Problem:** the `gh` CLI token had scopes `repo, read:org, gist` but **not
  `write:packages`** — can't push packages.
- **Fix:** created a PAT with `write:packages`, **stored it in Azure Key Vault**
  (`dp-kv-deliverypilot`), and logged Docker in by piping the secret out of the
  vault — so the token never sat in a command line:
  ```
  az keyvault secret show --vault-name dp-kv-deliverypilot --name ghcr-pat --query value -o tsv \
    | docker login ghcr.io -u rifaterdemsahin --password-stdin
  ```
- Built and pushed **`--platform linux/amd64`** (RunPod runs amd64; we're on
  Apple silicon, so buildx emulates).
- Made the package **public**, then **verified anonymous pull** with a token-less
  manifest fetch (HTTP 200) so RunPod could pull without registry creds.

> **Lesson:** the registry push needs `write:packages`, not the default `gh`
> scopes. Keep the token in a vault and pipe it into `docker login`.

### 3. Switch storage S3 → Azure Blob (chosen mid-flight)
- The handler was first written for S3 (boto3). We picked **Azure Blob**, so we
  **rewrote `handler.py`** to use `azure-storage-blob`, swapped the pip dep in
  the Dockerfile, and **rebuilt + repushed** the image (same `:latest` tag).
- Verified the new image imports the Azure SDK (`docker run --entrypoint python3
  … -c "import runpod, azure.storage.blob"`).

> **Lesson:** the worker is storage-specific. Changing the bucket backend means a
> code change + image rebuild, not just new secrets.

### 4. Create the RunPod endpoint + set secrets
- Created a Serverless endpoint (`s13kv6t2jg78lk`) on the public image, cheapest
  GPU, Max workers ~20, Min 1.
- Set 4 endpoint secrets: `AZURE_STORAGE_CONNECTION_STRING`,
  `AZURE_CONTAINER=$web`, `AZURE_PREFIX=mcp`,
  `PUBLIC_BASE_URL=https://claudecertstore.z13.web.core.windows.net`.

### 5. Make the upload target real — the static-website gotcha
- **Problem:** the storage account *listed* a static-web URL, but static website
  hosting was **disabled** and the `$web` container **didn't exist** — so uploads
  had nowhere to land (web endpoint 404'd).
- **Fix (run by the account owner):**
  ```
  az storage blob service-properties update --account-name claudecertstore \
    --static-website --index-document index.html --404-document index.html --auth-mode login
  ```
  This enabled hosting and created the public `$web` container.

> **Lesson:** a static-website *URL* existing ≠ static website *enabled*. Verify
> the feature is on and `$web` exists before expecting public reads.

### 6. Submit the jobs — two gotchas
- **Gotcha A — placeholder run literally:** the first submit used my placeholder
  `RUNPOD_API_KEY=…` verbatim. The `…` is a real Unicode char (U+2026), which
  blew up building the `Authorization: Bearer …` header
  (*"character … value 8230 > 255"*). **Fix:** use the real key — stored in the
  vault and pulled at runtime:
  ```
  RUNPOD_API_KEY=$(az keyvault secret show --vault-name dp-kv-deliverypilot --name runpod-api-key --query value -o tsv) \
  RUNPOD_ENDPOINT_ID=s13kv6t2jg78lk CONCURRENCY=10 node runpod-submit.mjs
  ```
- **Gotcha B — first real run produced 0 outputs:** jobs failed because the
  storage target wasn't ready yet (step 5) / secrets weren't all set. After
  fixing those, a re-run rendered and uploaded all **50/50**.

> **Lesson:** don't run example commands with `…`/`YOUR_KEY` placeholders. And an
> empty `outputs.json` = every job failed → check endpoint logs (almost always a
> missing secret or a missing bucket).

### 7. Verify outputs without RBAC
- We confirmed clips by **probing the public URLs** (`curl` the
  `…/mcp/mcp_NN.mp4` endpoints) — the `az storage blob` data-plane calls failed
  because the logged-in identity lacked the **Storage Blob Data** role.
- The **worker** uploads fine regardless, because it authenticates with the
  **account key** in the connection string, which **bypasses RBAC**.

> **Lesson:** control-plane (`az`) ≠ data-plane (blob read/write). The account key
> grants data access without an RBAC role — which is also why that key is
> sensitive.

### 8. Wire the page + publish
- Set `OUTPUT_BASE_URL` in `batch_inrunpod.html` to the Azure static-site base so
  all 50 clips appear (the page builds deterministic URLs; `outputs.json` is
  optional).
- Committed + pushed → GitHub Pages deployed → 50/50 live.

---

## Security notes (important)
Two secrets were pasted into chat during the session and must be treated as
compromised:
1. The GitHub **`master_pat`** → revoke at <https://github.com/settings/tokens>.
2. The **storage account key** → rotate:
   `az storage account keys renew -g claude-certificate-training -n claudecertstore --key primary`
   (then refresh the `AZURE_STORAGE_CONNECTION_STRING` secret on the endpoint).

**Rule we followed:** never paste a secret into a command line or chat — store it
in the vault and pipe it into the tool that needs it (`docker login`,
`runpod-submit.mjs`).

---

## The shortest path (next time)
1. `docker buildx build --platform linux/amd64 -f runpod/Dockerfile -t ghcr.io/<user>/claude-animations-runpod:latest --push .` (logged in via vault)
2. Make the package public; verify anonymous pull.
3. Ensure Azure static website is **enabled** and `$web` exists.
4. Create the endpoint; set the 4 `AZURE_*` secrets (connection string from vault).
5. `RUNPOD_API_KEY=$(vault) RUNPOD_ENDPOINT_ID=… node runpod-submit.mjs`.
6. Set `OUTPUT_BASE_URL`, commit, push.

See [`PERFORMANCE_RATIONALE.md`](./PERFORMANCE_RATIONALE.md) for *why* this was
slower than local for 50 clips and when it's worth it.
