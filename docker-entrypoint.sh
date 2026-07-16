#!/bin/sh
# Start as root just long enough to make the data dir writable, then drop
# privileges. PUID/PGID let Unraid-style setups pick the owner (default 1000).
set -e

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR/uploads"
  chown -R "$PUID:$PGID" "$DATA_DIR"
  exec su-exec "$PUID:$PGID" node src/index.js
fi

# Container was started with an explicit --user; trust it.
mkdir -p "$DATA_DIR/uploads" 2>/dev/null || true
exec node src/index.js
