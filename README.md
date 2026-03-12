# Medical-pi

Medical AI Assistant powered by MedGemma 4B and Modal.

## Architecture

- **UI**: Next.js + React + TailwindCSS + Assistant-UI (runs on PORT, default 3003)
- **API**: Fastify + TypeScript + SQLite (runs on PORT+1000, default 4003)
- **LLM**: Modal-hosted MedGemma 4B
- **Search**: Meilisearch for full-text search (starts automatically)

## Quick Start

```bash
# Initial setup
npm install
npm run onboard

# Development (starts everything: Meilisearch, API, UI)
npm run dev

# Production (starts everything: Meilisearch, API, UI)
npm run build
npm start
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development (Meilisearch + API + UI with hot reload) |
| `npm start` | Start production (Meilisearch + API + UI) |
| `npm run dev:server` | Start only API in dev mode |
| `npm run dev:ui` | Start only UI in dev mode |
| `npm run start:server` | Start only API in production |
| `npm run start:ui` | Start only UI in production |
| `npm run start:meilisearch` | Start only Meilisearch |
| `npm run onboard` | Interactive setup wizard |

## Port Configuration

- `PORT` in `.env` sets the **UI port** (default: 3003)
- **API port** is automatically `PORT + 1000` (default: 4003)
- **Meilisearch** runs on port 7700

Example:
```
PORT=3003  # UI on :3003, API on :4003
PORT=8080  # UI on :8080, API on :9080
```

## Meilisearch

Meilisearch starts **automatically** when you run `npm start` or `npm run dev`. No manual intervention needed.

If you need to run it separately:
```bash
npm run start:meilisearch
```

Or manually:
```bash
# Windows
.\bin\meilisearch.exe --db-path ./data/meilisearch --http-addr 127.0.0.1:7700

# Linux/macOS
./bin/meilisearch --db-path ./data/meilisearch --http-addr 127.0.0.1:7700
```
