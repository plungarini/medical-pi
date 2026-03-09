# medical-pi

Medical AI Assistant microservice for the Pi ecosystem. Provides a conversational interface with a local MedGemma model, automatic medical profile extraction, document management, and semantic search.

## Features

- **AI-Powered Chat**: Conversational interface powered by MedGemma 4B via Modal
- **Breathing Profile**: Automatic extraction and updates of medical information from conversations
- **Document Management**: Upload and search medical documents (PDFs, images, text)
- **Semantic Search**: Full-text search across conversations and documents via Meilisearch
- **Agent Tools**: Search past sessions, retrieve medical profile, search documents, web search
- **Heartbeat Jobs**: Automated profile review, title generation, and periodic syncing

## Architecture

```
medical-pi/
├── src/
│   ├── core/              # Infrastructure (db, logger, clients)
│   ├── services/          # Business logic
│   ├── api/routes/        # Fastify routes
│   └── types/             # TypeScript definitions
├── ui/                    # React + Vite frontend
├── prompts/               # LLM prompts
└── scripts/               # Onboarding script
```

## Quick Start

```bash
# Install dependencies
npm install

# Run interactive onboarding
npm run onboard

# Start development server
npm run dev

# Or start production server
npm start
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3003 |
| `MODAL_ENDPOINT` | MedGamma inference endpoint | Required |
| `OPENROUTER_API_KEY` | OpenRouter API key | Required |
| `JWT_SECRET` | JWT signing secret | Required |
| `MEILISEARCH_HOST` | Meilisearch URL | http://127.0.0.1:7700 |
| `HEARTBEAT_ENABLED` | Enable cron jobs | true |

See `.env.example` for complete configuration.

## API Endpoints

### Auth
- `POST /api/auth/login` - Authenticate (creates user if new)
- `GET /api/auth/me` - Get current user

### Sessions
- `GET /api/sessions` - List sessions
- `POST /api/sessions` - Create session
- `GET /api/sessions/:id` - Get session with messages
- `PATCH /api/sessions/:id` - Update session
- `DELETE /api/sessions/:id` - Delete session

### Chat
- `POST /api/chat/:sessionId` - Send message (SSE streaming)

### Profile
- `GET /api/profile` - Get medical profile
- `PATCH /api/profile` - Update profile
- `GET /api/profile/history` - Get profile update history
- `DELETE /api/profile/entry/:field/:id` - Delete profile entry

### Documents
- `GET /api/documents` - List documents
- `POST /api/documents` - Upload document
- `GET /api/documents/:id` - Get document
- `DELETE /api/documents/:id` - Delete document

### Search
- `GET /api/search?q=...` - Search messages

## Development

```bash
# Run tests
npm test

# Type check
npm run typecheck

# Build for production
npm run build
```

## License

MIT
