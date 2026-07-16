# MileMarker

Self-hosted vehicle maintenance and fuel tracking. One lightweight container, one SQLite file, no accounts, no cloud — built to make the most common action (logging a fill-up at the pump) as fast as possible on your phone.

## Features

- **Fuel & charging log** — fill-ups with cost, quantity, partial-fill and missed-fill-up handling, automatic fuel-economy and price-per-gallon calculation. Vehicles marked as **electric** track charges in kWh with mi/kWh efficiency instead.
- **Service, repair & upgrade records** — multiple line items per visit, costs, notes, and attached receipt photos/documents. Sortable, filterable history.
- **Reminders** — recurring (every X miles and/or Y months, auto-advancing when you log the matching service) or one-time (due at a date and/or odometer). Urgency-ranked with progress bars.
- **Overview dashboard** — stat tiles, upcoming reminders, and multi-metric trend charts (fuel economy, distance driven, monthly spend, fuel price) with time ranges and a table view.
- **Vehicles** — photos and documents (insurance, registration), per-vehicle notes, purchase/sale prices with all-in cost of ownership, and a sold-vehicle archive that keeps full history.
- **Fast mobile entry** — installable PWA with a "Log fuel" home-screen shortcut, one-tap fuel logging from the garage, and thumb-reachable actions throughout.
- **LubeLogger import** — drop in your whole LubeLogger appdata folder and vehicles, records, reminders, *and attached images* come across (the CSV export can't do images; this reads the LiteDB database directly).
- **CSV import** — bulk-import records from a simple documented CSV. Pair it with the bundled **Claude skill** ([`skills/milemarker-receipts`](skills/milemarker-receipts/SKILL.md), also downloadable from the app's Settings page): photograph your receipts, have Claude fill out the CSV, import it here. No AI inside the app itself.
- **Backup & restore** — one-click zip of the database plus all attachments, restorable from the Settings page. Plus a JSON export for portability.
- **Units & theming** — miles/km, gallons/litres, currency symbol, light/dark mode.

## Tech stack

React + Vite + Tailwind frontend, Node.js/Express + SQLite (`better-sqlite3`) backend, bundled into a single Docker image (the backend serves the built frontend). Every push to `main` and every `v*` tag publishes `ghcr.io/tcart38/milemarker` via GitHub Actions.

## Quick start (Docker Compose)

```yaml
services:
  milemarker:
    image: ghcr.io/tcart38/milemarker:latest
    ports:
      - "3002:3002"
    volumes:
      - milemarker-data:/data
    restart: unless-stopped

volumes:
  milemarker-data:
```

```bash
docker compose up -d
```

Open `http://<host>:3002`, add a vehicle, done. All data lives in the `/data` volume (SQLite database + uploaded attachments).

## Installing on Unraid

Single container, no compose needed:

1. Docker tab → **Add Container**:
   - **Repository**: `ghcr.io/tcart38/milemarker:latest` (pin a release with e.g. `:1.0.0`)
   - **Network Type**: `Bridge`
   - **Port**: host port of your choice → container `3002`
   - **Path**: an appdata folder (e.g. `/mnt/user/appdata/milemarker`) → container `/data` (read/write — holds the database and attachments)
2. Apply, then visit `http://<your-unraid-ip>:<host-port>`.

**Updating:** Docker tab → click the MileMarker icon → **Force Update**. Your data is safe in the `/data` mount.

> **Note on permissions:** the container runs as an unprivileged user (uid 1000). If your appdata folder was created by a pre-1.0 root container, fix ownership once: `chown -R 1000:1000 /mnt/user/appdata/milemarker`.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3002` | Port the server listens on |
| `DATA_DIR` | `/data` | Writable folder for the SQLite database and uploads — persist this |
| `ALLOWED_HOSTS` | *(empty)* | Extra hostnames allowed in the `Host` header, comma-separated (see Security) |
| `NODE_ENV` | — | `production` in Docker; enables serving the built frontend |

Units, currency, service types, and theme are configured in the app under **Settings**.

## Importing your data

**From LubeLogger:** Settings → *Import from LubeLogger* → select your entire LubeLogger appdata folder (the one containing `data/cartracker.db`). Vehicles, fuel, service/repair/upgrade history, odometer readings, reminders, purchase/sale info, EV flags, and attached images/documents are imported. Vehicles that already exist (same year/make/model/plate) are skipped, so re-running is safe.

**From CSV:** Settings → *Import records from CSV*. One row per record; the format is documented in the app with a downloadable template. Re-importing the same rows won't create duplicates. To digitize paper receipts, grab the **Claude skill** from that same Settings card — give Claude your receipt photos and it produces a ready-to-import CSV.

## Backups

Settings → *Data* → **Download backup** produces a zip containing the database and every attachment. **Restore backup** replaces all current data with a backup's contents (the previous database is kept on disk as `milemarker.db.pre-restore`, a one-level undo). Back up before major imports.

## Security model

MileMarker has **no authentication** — it's designed to run on a trusted home LAN. Mitigations built in: no CORS (browsers can't drive the API cross-origin), a `Host`-header allowlist blocking DNS-rebinding attacks (localhost, `.local` names, and IP literals allowed by default; add reverse-proxy hostnames via `ALLOWED_HOSTS`), and an unprivileged container user.

**Do not port-forward this to the internet.** For remote access, put it behind a reverse proxy with authentication, or use a VPN/Tailscale.

## Development

Requires Node.js 20+.

```bash
# Backend — http://localhost:3002
cd backend
cp .env.example .env      # PORT=3002, DATA_DIR=./.data
npm install
npm run dev

# Frontend (separate terminal) — proxies /api to :3002
cd frontend
npm install
npm run dev
```

The SQLite database is created automatically under `DATA_DIR`.

## License

MIT — see [LICENSE](LICENSE).
