# ── Stage 1: build frontend ──────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --frozen-lockfile 2>/dev/null || npm install
COPY frontend/ ./
RUN npm run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# su-exec: drop from root to PUID/PGID after fixing /data ownership at startup
RUN apk add --no-cache su-exec

# Install backend deps (better-sqlite3 needs build tools to compile its native binding)
COPY backend/package.json backend/package-lock.json* ./
RUN apk add --no-cache --virtual .build python3 make g++ && \
    (npm install --frozen-lockfile 2>/dev/null || npm install --omit=dev) && \
    apk del .build

# Backend source
COPY backend/src ./src

# Built frontend served as static assets by the backend
COPY --from=frontend-builder /app/frontend/dist ./public

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

ENV NODE_ENV=production \
    PORT=3002 \
    DATA_DIR=/data

EXPOSE 3002

# Starts as root, chowns $DATA_DIR to PUID:PGID (default 1000:1000), then runs
# the app unprivileged via su-exec. Works with bind mounts (Unraid appdata)
# and named volumes alike.
ENTRYPOINT ["./docker-entrypoint.sh"]
