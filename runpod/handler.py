"""
handler.py — RunPod serverless worker for the Remotion bundle (Azure Blob).

One job = one clip. Job input:
    { "props": { ...inputProps... }, "out": "mcp_01.mp4" }

The handler renders via node render-one.mjs (using the pre-built bundle baked
into the image), uploads the MP4 to Azure Blob Storage, and returns the public
URL. RunPod runs this across the worker pool, so submitting 50 jobs renders them
in parallel — that is the whole point of using RunPod here.

Env vars (set as RunPod endpoint secrets):
    AZURE_STORAGE_CONNECTION_STRING   connection string for the storage account
    AZURE_CONTAINER                   container name (public "Blob" access)
    AZURE_PREFIX                      optional blob-name prefix, default "mcp"
    PUBLIC_BASE_URL                   public base the container serves from, no
                                      trailing slash, e.g.
                                      https://<account>.blob.core.windows.net/<container>
                                      -> final url = {PUBLIC_BASE_URL}/{prefix}/{out}
"""
import json
import os
import subprocess
import tempfile

import runpod
from azure.storage.blob import BlobServiceClient, ContentSettings

CONN = os.environ["AZURE_STORAGE_CONNECTION_STRING"]
CONTAINER = os.environ["AZURE_CONTAINER"]
PREFIX = os.environ.get("AZURE_PREFIX", "mcp").strip("/")
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")

_svc = BlobServiceClient.from_connection_string(CONN)
_container = _svc.get_container_client(CONTAINER)


def handler(job):
    inp = job.get("input") or {}
    props = inp.get("props")
    out_name = inp.get("out")
    if not props or not out_name:
        return {"error": "input must contain 'props' and 'out'"}

    blob_name = f"{PREFIX}/{out_name}" if PREFIX else out_name

    with tempfile.TemporaryDirectory() as tmp:
        out_path = os.path.join(tmp, out_name)
        # render this single clip against the baked-in bundle
        subprocess.run(
            ["node", "render-one.mjs", json.dumps(props), out_path],
            cwd="/app",
            check=True,
        )
        with open(out_path, "rb") as f:
            _container.upload_blob(
                name=blob_name,
                data=f,
                overwrite=True,
                content_settings=ContentSettings(content_type="video/mp4"),
            )

    url = f"{PUBLIC_BASE_URL}/{blob_name}" if PUBLIC_BASE_URL else None
    return {"key": blob_name, "container": CONTAINER, "url": url, "out": out_name}


runpod.serverless.start({"handler": handler})
