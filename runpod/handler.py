"""
handler.py — RunPod serverless worker for the Remotion bundle.

One job = one clip. Job input:
    { "props": { ...inputProps... }, "out": "mcp_01.mp4" }

The handler renders via node render-one.mjs (using the pre-built bundle baked
into the image), uploads the MP4 to an S3-compatible bucket, and returns the
public URL. RunPod runs this across the worker pool, so submitting 50 jobs
renders them in parallel — that is the whole point of using RunPod here.

Env vars (set as RunPod endpoint secrets):
    S3_ENDPOINT        e.g. https://<accountid>.r2.cloudflarestorage.com  (R2)
                       or   https://s3.<region>.amazonaws.com             (AWS)
    S3_BUCKET          bucket name
    S3_ACCESS_KEY_ID   access key
    S3_SECRET_KEY      secret key
    S3_PREFIX          optional key prefix, default "mcp"
    PUBLIC_BASE_URL    public base the bucket serves from (no trailing slash),
                       e.g. https://pub-xxxx.r2.dev  -> page builds {base}/{prefix}/{out}
"""
import json
import os
import subprocess
import tempfile

import boto3
import runpod

S3_ENDPOINT = os.environ["S3_ENDPOINT"]
S3_BUCKET = os.environ["S3_BUCKET"]
S3_PREFIX = os.environ.get("S3_PREFIX", "mcp").strip("/")
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")

s3 = boto3.client(
    "s3",
    endpoint_url=S3_ENDPOINT,
    aws_access_key_id=os.environ["S3_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["S3_SECRET_KEY"],
)


def handler(job):
    inp = job.get("input") or {}
    props = inp.get("props")
    out_name = inp.get("out")
    if not props or not out_name:
        return {"error": "input must contain 'props' and 'out'"}

    with tempfile.TemporaryDirectory() as tmp:
        out_path = os.path.join(tmp, out_name)
        # render this single clip against the baked-in bundle
        subprocess.run(
            ["node", "render-one.mjs", json.dumps(props), out_path],
            cwd="/app",
            check=True,
        )

        key = f"{S3_PREFIX}/{out_name}" if S3_PREFIX else out_name
        s3.upload_file(
            out_path,
            S3_BUCKET,
            key,
            ExtraArgs={"ContentType": "video/mp4"},
        )

    url = f"{PUBLIC_BASE_URL}/{key}" if PUBLIC_BASE_URL else None
    return {"key": key, "bucket": S3_BUCKET, "url": url, "out": out_name}


runpod.serverless.start({"handler": handler})
