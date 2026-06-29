# RunPod serverless worker image for the Remotion bundle.
# Renders one concept_reveal clip per job and uploads it to S3-compatible storage.
#
#   docker build -f runpod/Dockerfile -t <user>/claude-animations-runpod:latest .
#   docker push  <user>/claude-animations-runpod:latest
#   # then point a RunPod serverless endpoint at that image.
#
# Build context = repo root (so it can COPY src/, package.json, etc.).
FROM node:20-bookworm-slim

# OS libraries headless Chrome needs (Remotion downloads chrome-headless-shell,
# but the shared libs must be present) + python for the RunPod worker SDK.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip python3-venv \
      ca-certificates fonts-liberation \
      libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
      libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
      libgbm1 libpango-1.0-0 libcairo2 libasound2 libatspi2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Node deps + pre-build the Remotion bundle ONCE into /app/out
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npx remotion bundle src/index.ts --out-dir=out
# pre-download the headless browser so cold jobs don't fetch it
RUN npx remotion browser ensure

# Python worker SDK + S3 client
RUN pip3 install --break-system-packages --no-cache-dir runpod boto3

# worker code
COPY runpod/handler.py runpod/render-one.mjs ./

CMD ["python3", "handler.py"]
