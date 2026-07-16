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

# Install backend deps (better-sqlite3 needs build tools to compile its native binding)
COPY backend/package.json backend/package-lock.json* ./
RUN apk add --no-cache --virtual .build python3 make g++ && \
    (npm install --frozen-lockfile 2>/dev/null || npm install --omit=dev) && \
    apk del .build

# Backend source
COPY backend/src ./src

# Built frontend served as static assets by the backend
COPY --from=frontend-builder /app/frontend/dist ./public

ENV NODE_ENV=production \
    PORT=3002 \
    DATA_DIR=/data

# Run unprivileged. Volumes created fresh inherit this ownership; a volume that
# predates this change may need a one-time: docker run --rm -v <vol>:/data alpine chown -R 1000:1000 /data
RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 3002

CMD ["sh", "-c", "mkdir -p $DATA_DIR && node src/index.js"]
