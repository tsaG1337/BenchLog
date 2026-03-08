# RV-10 Build Tracker — Self-Hosted Backend

Express + SQLite + MinIO backend for the RV-10 Build Tracker.

## Prerequisites

- **Node.js 18+**
- **MinIO** running on your TrueNAS server (or any S3-compatible storage)

## Quick Start

```bash
cd server
npm install

# Configure via environment variables (or create a .env file and use dotenv)
export PORT=3001
export MINIO_ENDPOINT=your-truenas-ip
export MINIO_PORT=9000
export MINIO_USE_SSL=false
export MINIO_ACCESS_KEY=minioadmin
export MINIO_SECRET_KEY=minioadmin
export MINIO_BUCKET=session-images
export DB_PATH=/path/to/data/rv10.db

npm start
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `MINIO_ENDPOINT` | `localhost` | MinIO hostname/IP |
| `MINIO_PORT` | `9000` | MinIO API port |
| `MINIO_USE_SSL` | `false` | Use HTTPS for MinIO |
| `MINIO_ACCESS_KEY` | `minioadmin` | MinIO access key |
| `MINIO_SECRET_KEY` | `minioadmin` | MinIO secret key |
| `MINIO_BUCKET` | `session-images` | Bucket for session images |
| `DB_PATH` | `./data/rv10.db` | Path to SQLite database file |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sessions` | List all sessions |
| POST | `/api/sessions` | Create a session |
| PUT | `/api/sessions/:id` | Update a session |
| DELETE | `/api/sessions/:id` | Delete a session |
| POST | `/api/upload` | Upload images (multipart) |
| DELETE | `/api/upload` | Delete an image |

## TrueNAS Deployment

1. Install MinIO from TrueNAS Apps or as a jail/container
2. Run this server as a systemd service, PM2 process, or in a jail
3. Set `VITE_API_URL` in the frontend to point to this server's URL
