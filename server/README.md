# Benchlog — Backend

Express + SQLite backend for Benchlog.

For a full project overview, features, and screenshots see the [root README](../README.md).

---

## Stack

- **Runtime**: Node.js 18+ (CommonJS)
- **Framework**: Express
- **Database**: SQLite via `better-sqlite3` (single file, zero configuration)
- **Image storage**: MinIO (S3-compatible)
- **Image processing**: `sharp` — server-side resize on upload (configurable max width, default 1920px) + automatic `_thumb.jpg` thumbnail generation (400px)
- **Auth**: Custom JWT (HS256, 72 h expiry), SHA-256 password hash stored in SQLite

All application logic lives in `index.js`. The backend serves the compiled frontend from `../dist/` at the root path so a single process handles everything in production.

---

## Prerequisites

- **Node.js 18+**
- **MinIO** running on your network (or any S3-compatible storage)

---

## Quick Start (standalone)

```bash
cd server
npm install

# Set required environment variables
export PORT=3001
export DB_PATH=./data/database.db
export JWT_SECRET=your-long-random-secret
export MINIO_ENDPOINT=your-minio-ip
export MINIO_PORT=9000
export MINIO_USE_SSL=false
export MINIO_ACCESS_KEY=minioadmin
export MINIO_SECRET_KEY=minioadmin
export MINIO_BUCKET=session-images

node index.js
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | HTTP port |
| `DB_PATH` | `./data/database.db` | SQLite file path |
| `JWT_SECRET` | *(generated)* | JWT signing secret — **always set this in production** |
| `MINIO_ENDPOINT` | `localhost` | MinIO hostname or IP |
| `MINIO_PORT` | `9000` | MinIO API port |
| `MINIO_USE_SSL` | `false` | Use HTTPS for MinIO |
| `MINIO_ACCESS_KEY` | `minioadmin` | MinIO access key |
| `MINIO_SECRET_KEY` | `minioadmin` | MinIO secret key |
| `MINIO_BUCKET` | `session-images` | Bucket for uploaded images |

---

## Docker Compose Deployment

The project ships with a `docker-compose.yml` at the repository root. It builds a single image that runs the backend and serves the compiled frontend:

```bash
# From the repo root
docker compose up -d --build
```

The `./data` directory is mounted to `/data` inside the container. Place your environment overrides in a `.env` file next to `docker-compose.yml`:

```env
JWT_SECRET=change-me-to-a-long-random-string
MINIO_ENDPOINT=192.168.1.2
MINIO_ACCESS_KEY=your-access-key
MINIO_SECRET_KEY=your-secret-key
```

---

## Database Schema

The SQLite database is created automatically on first run with the following tables:

| Table | Purpose |
|---|---|
| `sessions` | Work sessions (id, section, start/end time, duration, notes, plans reference, image URLs) |
| `active_timer` | Persists the running timer state across restarts |
| `blog_posts` | Manual blog/journal entries |
| `settings` | Key-value store for all application settings (general, MQTT, sections, flowchart, etc.) |

All settings (project name, target hours, progress mode, MQTT config, assembly sections, build progress packages and statuses) are stored as JSON values in the `settings` table under named keys.

---

## Settings Keys

| Key | Description |
|---|---|
| `general` | Project name, target build hours, progress calculation mode, image resizing settings |
| `mqtt` | MQTT broker config and Home Assistant discovery settings |
| `sections` | Assembly section configuration (id, label, icon) |
| `flowchart_status` | Build progress — status per work package (`none` / `in-progress` / `done`) |
| `flowchart_packages` | Build progress — nested work package tree per section |
| `password_hash` | SHA-256 hash of the admin password |

---

## API Reference

### Public (no auth)

| Method | Path | Description |
|---|---|---|
| GET | `/api/sessions` | All work sessions |
| GET | `/api/stats` | Build stats — total hours, progress %, est. finish date |
| GET | `/api/blog` | Blog posts (manual entries + sessions) with optional `?section=`, `?year=`, `?month=`, `?plansSection=` filters |
| GET | `/api/blog/archive` | Monthly archive counts |
| GET | `/api/blog/:id` | Single blog post |
| GET | `/api/settings/general` | General settings |
| GET | `/api/sections` | Assembly sections |
| GET | `/api/flowchart-status` | Build progress statuses |
| GET | `/api/flowchart-packages` | Build progress package tree |
| GET | `/api/timer/status` | Active timer state |
| GET | `/files/:object` | Serve uploaded images (proxied from MinIO) |
| POST | `/api/auth/login` | Authenticate; returns `{ token }` |
| POST | `/api/auth/setup` | Set password on first run |
| GET | `/api/auth/status` | Whether a password is configured |

### Authenticated (Bearer JWT required)

| Method | Path | Description |
|---|---|---|
| POST | `/api/sessions` | Create a session |
| PUT | `/api/sessions/:id` | Update a session |
| DELETE | `/api/sessions/:id` | Delete a session |
| POST | `/api/timer/start` | Start the server-side timer |
| POST | `/api/timer/stop` | Stop the timer and save the session |
| POST | `/api/upload` | Upload image (multipart/form-data) |
| DELETE | `/api/upload` | Delete an image |
| POST | `/api/blog` | Create a blog post |
| PUT | `/api/blog/:id` | Update a blog post |
| DELETE | `/api/blog/:id` | Delete a blog post |
| PUT | `/api/settings/general` | Update general settings |
| GET | `/api/settings/mqtt` | MQTT settings |
| PUT | `/api/settings/mqtt` | Update MQTT settings |
| POST | `/api/settings/mqtt/test` | Publish a test MQTT message |
| PUT | `/api/sections` | Update assembly sections |
| PUT | `/api/flowchart-status` | Update build progress statuses |
| PUT | `/api/flowchart-packages` | Update build progress package tree |
| GET | `/api/export` | Full JSON export (with base64-embedded images) |
| POST | `/api/import` | Restore from an export file |
| POST | `/api/auth/change-password` | Change the admin password |

---

## MQTT Topics

When MQTT publishing is enabled, the following topics are published after every session save:

```
{prefix}/total_hours          — total logged hours (float)
{prefix}/build_progress       — progress percentage (float)
{prefix}/total_sessions       — session count (integer)
{prefix}/last_session_images  — JSON array of image URLs
{prefix}/{section_id}         — hours per assembly section (float)
```

Home Assistant Auto-Discovery publishes sensor configs to `{ha_prefix}/sensor/{device_id}/*/config` so sensors appear in HA automatically.
