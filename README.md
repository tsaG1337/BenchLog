# RV-10 Build Tracker

A self-hosted web application for tracking the construction of a Van's RV-10 homebuilt aircraft. Log your build sessions, visualize progress, document your work through a blog, and monitor everything from a clean dashboard — all running on your own infrastructure.

---

## Features

### Time Tracking
- **Server-side timer** — start and stop a build session from the UI; the timer runs on the server so it survives page refreshes and browser restarts
- **Manual entry** — add sessions retrospectively with date, duration, section, notes, and plans reference
- **Session editing** — modify any session's start/end time, duration, section, notes, and plans reference inline
- **Image attachments** — upload photos to a session; images are stored in MinIO (S3-compatible object storage)

### Dashboard
- Total build hours and session count
- Progress bar and percentage complete (time-based or package-based — see Settings)
- Estimated finish date based on average weekly pace
- Hours broken down by build section (empennage, wings, fuselage, etc.)

### Build Progress Tracker
- Visual tracker organized by **Assembly Sections** (configurable in Settings)
- Add unlimited **work packages** with nested sub-packages (any depth)
- Click a chip to cycle its status: Not Started → In Progress → Done
- Per-section completion percentage (circular progress ring)
- Compact horizontal chip layout organized by depth level — no scrolling
- Collapsible sections for a clean overview
- Fully persistent — stored in the database

### Build Blog / Journal
- Write rich build log entries with a Markdown editor (bold, italic, headings, lists, images)
- Browse posts by section or by month in a collapsible archive sidebar
- Work sessions automatically appear as blog posts alongside manual entries
- Edit session posts (timing, section, notes, plans reference) directly from the blog
- Public read access — share your build log with the community, no login required

### Settings
- **Project name** and **target build hours**
- **Progress calculation mode** — switch between time-based (hours logged vs. target) and package-based (completed work packages from the build progress tracker)
- **Assembly Sections** — fully configurable: add, remove, reorder, and set icons for build sections
- **Theme** — Light, Dark, or system default
- **MQTT publishing** — publish build stats to a Home Assistant-compatible MQTT broker after every session (total hours, progress %, per-section hours, last session images)
- **Home Assistant Auto-Discovery** — automatically creates sensors in HA
- **Export / Import** — full JSON backup and restore including sessions, settings, flowchart state, and embedded images

### Authentication
- Single-user password authentication with JWT tokens (72-hour expiry)
- Public read access for the blog and stats; write operations require login

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui (Radix UI) |
| Backend | Node.js, Express (CommonJS) |
| Database | SQLite via `better-sqlite3` |
| Image Storage | MinIO (S3-compatible) |
| Auth | Custom JWT (HS256), SHA-256 password hash |
| Deployment | Docker + docker-compose |
| Home Automation | MQTT (Home Assistant integration) |

---

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/)
- A running **MinIO** instance (or any S3-compatible storage) for image uploads
- Optionally: an MQTT broker for Home Assistant integration

### Quick Start with Docker Compose

```yaml
# docker-compose.yml
services:
  app:
    build: .
    ports:
      - "3001:3001"
    volumes:
      - ./data:/data
    environment:
      PORT: 3001
      DB_PATH: /data/database.db
      JWT_SECRET: change-me-to-a-long-random-string
      MINIO_ENDPOINT: 192.168.1.2
      MINIO_PORT: 9000
      MINIO_USE_SSL: "false"
      MINIO_ACCESS_KEY: minioadmin
      MINIO_SECRET_KEY: minioadmin
      MINIO_BUCKET: session-images
```

```bash
docker compose up -d
```

The app is then available at `http://localhost:3001`.

On first visit, you will be prompted to set a password. After that, log in to access the timer, dashboard, and settings.

### Local Development

```bash
# Install dependencies
npm install
cd server && npm install && cd ..

# Start the backend
cd server && node index.js &

# Start the frontend dev server
npm run dev
```

Set `VITE_API_URL=http://localhost:3001` in a `.env.local` file so the frontend connects to the local backend.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | HTTP server port |
| `DB_PATH` | `./data/database.db` | Path to SQLite database file |
| `JWT_SECRET` | *(random)* | Secret key for signing JWT tokens — **set this in production** |
| `MINIO_ENDPOINT` | `localhost` | MinIO hostname or IP |
| `MINIO_PORT` | `9000` | MinIO API port |
| `MINIO_USE_SSL` | `false` | Use HTTPS for MinIO connections |
| `MINIO_ACCESS_KEY` | `minioadmin` | MinIO access key |
| `MINIO_SECRET_KEY` | `minioadmin` | MinIO secret key |
| `MINIO_BUCKET` | `session-images` | Bucket name for session image storage |

---

## API Reference

### Public endpoints (no auth required)

| Method | Path | Description |
|---|---|---|
| GET | `/api/sessions` | List all work sessions |
| GET | `/api/stats` | Build stats (total hours, progress %, est. finish) |
| GET | `/api/blog` | List blog posts (includes sessions as posts) |
| GET | `/api/blog/:id` | Get a single blog post |
| GET | `/api/settings/general` | General settings (project name, target hours) |
| GET | `/api/sections` | Assembly section configuration |
| GET | `/api/flowchart-status` | Build progress package statuses |
| GET | `/api/flowchart-packages` | Build progress package tree |
| GET | `/api/timer/status` | Current timer state |
| GET | `/files/:object` | Serve uploaded images (proxied from MinIO) |

### Authenticated endpoints (Bearer token required)

| Method | Path | Description |
|---|---|---|
| POST | `/api/sessions` | Create a work session |
| PUT | `/api/sessions/:id` | Update a session |
| DELETE | `/api/sessions/:id` | Delete a session |
| POST | `/api/timer/start` | Start the server-side timer |
| POST | `/api/timer/stop` | Stop the timer and save the session |
| POST | `/api/upload` | Upload an image (multipart/form-data) |
| DELETE | `/api/upload` | Delete an uploaded image |
| POST | `/api/blog` | Create a blog post |
| PUT | `/api/blog/:id` | Update a blog post |
| DELETE | `/api/blog/:id` | Delete a blog post |
| PUT | `/api/settings/general` | Update general settings |
| GET | `/api/settings/mqtt` | Get MQTT settings |
| PUT | `/api/settings/mqtt` | Update MQTT settings |
| POST | `/api/settings/mqtt/test` | Publish a test MQTT message |
| PUT | `/api/sections` | Update assembly section configuration |
| PUT | `/api/flowchart-status` | Update build progress statuses |
| PUT | `/api/flowchart-packages` | Update build progress package tree |
| GET | `/api/export` | Export full backup (JSON with embedded images) |
| POST | `/api/import` | Restore from a backup |
| POST | `/api/auth/login` | Authenticate and receive a JWT |
| POST | `/api/auth/setup` | Set the initial password (first run only) |

---

## Data Persistence

All data is stored in a single SQLite database at the path specified by `DB_PATH`. When using Docker, mount a host directory to `/data` so data survives container restarts:

```yaml
volumes:
  - ./data:/data
```

Uploaded images are stored in MinIO and are **not** included in the Docker volume — make sure your MinIO data is also backed up. The Export function embeds all images as base64 in the JSON backup so you can restore everything from a single file.

---

## Home Assistant Integration

Enable MQTT publishing in Settings and point it at your broker. After each session the tracker publishes:

| Topic | Value |
|---|---|
| `{prefix}/total_hours` | Total logged hours |
| `{prefix}/build_progress` | Progress percentage |
| `{prefix}/total_sessions` | Number of sessions |
| `{prefix}/last_session_images` | JSON array of image URLs |
| `{prefix}/{section_id}` | Hours per assembly section |

Enable **Home Assistant Auto-Discovery** to have sensors appear in HA automatically without any manual YAML configuration.

---

## License

Personal / private use. Not affiliated with Van's Aircraft, Inc.
