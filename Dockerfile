FROM node:22-bookworm-slim AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    jq \
    unzip \
    ripgrep \
    fd-find \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 10001 piweb

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/bin ./bin
COPY --from=builder /app/next.config.ts ./next.config.ts

RUN mkdir -p /data/pi-agent /data/chat /data/workspaces /data/cache /data/uploads \
    && chown -R piweb:piweb /app /data

USER piweb

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=30141
ENV PI_CODING_AGENT_DIR=/data/pi-agent
ENV PI_WEB_CHAT_ROOT=/data/chat
ENV PI_WEB_WORKSPACE_ROOTS=/data/workspaces
ENV PI_WEB_UPLOAD_ROOT=/data/uploads

EXPOSE 30141

CMD ["node", "bin/pi-web.js", "--hostname", "0.0.0.0", "--port", "30141"]
