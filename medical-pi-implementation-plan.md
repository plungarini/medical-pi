# medical-pi — Coding Spec

**Port:** `3003` | **Domain:** `http://medical.pi`
**Primary inference:** Modal (MedGemma 4B, OpenAI-compatible endpoint, configured via `MODAL_ENDPOINT`)
**Utility inference:** OpenRouter (`google/gemini-2.0-flash-001`) — breathing, titles, cron

---

## Stack

| Layer            | Choice                                                                            |
| ---------------- | --------------------------------------------------------------------------------- |
| Runtime          | Node.js, TypeScript, ESM (`"moduleResolution": "NodeNext"`, `"target": "ES2022"`) |
| Framework        | Fastify                                                                           |
| Database         | SQLite via `better-sqlite3`                                                       |
| Full-text search | Meilisearch native binary, bound to `127.0.0.1:7700`, no auth                     |
| LLM client       | `openai` npm package (pointed at Modal or OpenRouter via `baseURL`)               |
| Scheduling       | `node-cron`                                                                       |
| Validation       | `zod`                                                                             |
| UI               | React + Vite + TailwindCSS                                                        |

---

## Repo Structure

```
medical-pi/
  src/
    core/
      db.ts                  ← SQLite client + migrations runner
      logger.ts              ← logger-pi integration (guidelines §3)
      modalClient.ts         ← OpenAI client → MODAL_ENDPOINT
      openrouterClient.ts    ← OpenAI client → OpenRouter
      searchClient.ts        ← Meilisearch client
      fileStore.ts           ← document filesystem ops
      jwtMiddleware.ts       ← Fastify JWT plugin
    services/
      chatService.ts         ← session + message persistence, context assembly
      agentService.ts        ← agent loop: tool dispatch, re-injection, SSE routing
      profileService.ts      ← profile CRUD + breathing updater
      documentService.ts     ← upload, text extraction, Meilisearch indexing
      searchService.ts       ← Meilisearch index writes + queries
      heartbeatService.ts    ← node-cron job definitions
      titleService.ts        ← auto session title via OpenRouter
      streamService.ts       ← SSE event formatting + flushing helpers
    api/
      server.ts              ← Fastify instance, plugin registration, static SPA
      routes/
        auth.ts
        sessions.ts
        chat.ts              ← SSE streaming endpoint
        profile.ts
        documents.ts
        search.ts
        health.ts
    types/
      index.ts               ← all shared interfaces (see §Types)
    tests/
      auth.test.ts
      chatService.test.ts
      profileService.test.ts
      agentService.test.ts
      heartbeat.test.ts
    index.ts
  ui/
    src/
      pages/
        Chat.tsx
        Profile.tsx
        Documents.tsx
        Sessions.tsx
      components/
        MessageBubble.tsx    ← wraps ThinkingPanel + ToolCallCard + ProfileBadge
        ThinkingPanel.tsx
        ToolCallCard.tsx
        ProfileBadge.tsx
        SessionList.tsx
        DocumentCard.tsx
        ProfileSection.tsx
        AttachmentInput.tsx
      services/
        api.ts               ← typed HTTP + SSE client
        auth.ts              ← token storage
      App.tsx
      main.tsx
    vite.config.ts           ← dev proxy: /api + /health → localhost:3003
    package.json
  scripts/
    onboard.js               ← interactive env setup (guidelines §2)
  prompts/
    system.txt               ← MedGemma system prompt ({MEDICAL_PROFILE_JSON} placeholder)
    profile-extractor.txt    ← OpenRouter extraction prompt (returns ProfileDiff JSON)
    session-title.txt        ← OpenRouter title prompt (returns plain string ≤8 words)
  .env.example
  vitest.config.ts
  README.md
```

---

## Types (`src/types/index.ts`)

```typescript
// --- Auth ---
interface User {
	id: string; // UUID
	username: string;
	createdAt: string; // ISO
}

// --- Sessions ---
interface Session {
	id: string;
	userId: string;
	title: string;
	createdAt: string;
	updatedAt: string;
	messageCount: number;
	pinned: boolean;
}

interface Attachment {
	type: 'image' | 'document' | 'audio';
	name: string;
	mimeType: string;
	url: string; // relative path under BASE_STORAGE_PATH
}

interface ToolCall {
	id: string;
	name: string;
	args: Record<string, unknown>;
	result?: unknown;
}

interface Message {
	id: string;
	sessionId: string;
	role: 'user' | 'assistant' | 'tool';
	content: string;
	attachments: Attachment[];
	toolCalls: ToolCall[];
	thinkingContent: string;
	createdAt: string;
}

// --- Medical Profile ---
type ProfileSource = 'auto' | 'manual';

interface Condition {
	id: string;
	name: string;
	diagnosedAt?: string;
	resolvedAt?: string;
	severity?: string;
	notes?: string;
	source: ProfileSource;
	confidence?: number; // auto entries only, 0–1
}

interface Medication {
	id: string;
	name: string;
	dosage?: string;
	frequency?: string;
	startedAt?: string;
	notes?: string;
	source: ProfileSource;
}

interface Allergy {
	id: string;
	substance: string;
	reaction?: string;
	severity?: string;
	source: ProfileSource;
}

interface VitalReading {
	id: string;
	type: string; // e.g. "blood_pressure", "heart_rate"
	value: string; // e.g. "120/80", "72 bpm"
	recordedAt: string;
	source: ProfileSource;
}

interface LabResult {
	id: string;
	name: string;
	value: string;
	unit?: string;
	referenceRange?: string;
	recordedAt: string;
	source: ProfileSource;
}

interface Surgery {
	id: string;
	name: string;
	date?: string;
	notes?: string;
	source: ProfileSource;
}

interface FamilyCondition {
	id: string;
	relation: string;
	condition: string;
	notes?: string;
	source: ProfileSource;
}

interface MedicalProfile {
	userId: string;
	updatedAt: string;
	demographics: {
		dateOfBirth?: string;
		sex?: string;
		height?: string;
		weight?: string;
		bloodType?: string;
	};
	currentConditions: Condition[];
	persistentConditions: Condition[];
	pastConditions: Condition[];
	medications: Medication[];
	allergies: Allergy[];
	vitals: VitalReading[];
	labResults: LabResult[];
	surgeries: Surgery[];
	familyHistory: FamilyCondition[];
	lifestyle: {
		smoking?: string;
		alcohol?: string;
		exercise?: string;
		diet?: string;
		sleep?: string;
	};
	freeNotes?: string;
}

// --- Profile Breathing ---
interface ProfilePatch {
	field: keyof Omit<MedicalProfile, 'userId' | 'updatedAt'>;
	operation: 'add' | 'update' | 'remove';
	value: unknown;
	confidence: number; // 0–1
}
interface ProfileDiff {
	hasNewInfo: boolean;
	patches: ProfilePatch[];
}

// Zod schema for OpenRouter output validation — defined in profileService.ts
// ProfileDiffSchema mirrors ProfileDiff exactly

interface ProfileHistoryEntry {
	id: string;
	userId: string;
	diff: ProfileDiff;
	createdAt: string;
}

// --- Documents ---
interface MedicalDocument {
	id: string;
	userId: string;
	name: string;
	mimeType: string;
	path: string;
	extractedContent?: string;
	uploadedAt: string;
}

// --- SSE Events ---
type SSEEvent =
	| { event: 'thinking'; data: { token: string } }
	| { event: 'tool_call'; data: { id: string; name: string; args: unknown } }
	| { event: 'tool_result'; data: { id: string; name: string; result: unknown } }
	| { event: 'content'; data: { token: string } }
	| { event: 'profile_updated'; data: { fields: string[]; flagged: boolean } }
	| { event: 'done'; data: { messageId: string; sessionId: string } }
	| { event: 'error'; data: { message: string } };
```

---

## SQLite Schema (`src/core/db.ts`)

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user','assistant','tool')),
  content TEXT NOT NULL DEFAULT '',
  attachments TEXT NOT NULL DEFAULT '[]',   -- JSON
  tool_calls TEXT NOT NULL DEFAULT '[]',    -- JSON
  thinking_content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE medical_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  profile TEXT NOT NULL DEFAULT '{}',       -- JSON (MedicalProfile)
  updated_at TEXT NOT NULL
);

CREATE TABLE profile_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  diff TEXT NOT NULL,                       -- JSON (ProfileDiff)
  created_at TEXT NOT NULL
);

CREATE TABLE medical_documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  path TEXT NOT NULL,
  extracted_content TEXT,
  uploaded_at TEXT NOT NULL
);

CREATE INDEX idx_messages_session ON messages(session_id);
CREATE INDEX idx_sessions_user ON sessions(user_id, updated_at DESC);
CREATE INDEX idx_documents_user ON medical_documents(user_id);
CREATE INDEX idx_profile_history_user ON profile_history(user_id, created_at DESC);
```

---

## LLM Clients

### `src/core/modalClient.ts`

- `new OpenAI({ baseURL: MODAL_ENDPOINT, apiKey: MODAL_API_KEY ?? 'unused' })`
- model hardcoded: `'medgemma-4b-it'`
- handles: streaming completions, multimodal content parts (base64 `image_url`), tool definitions, tool result injection
- cold start retry: up to 3x with exponential backoff on connection timeout
- throws `ModalError` on non-retriable failure

### `src/core/openrouterClient.ts`

- `new OpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey: OPENROUTER_API_KEY })`
- default headers: `HTTP-Referer: http://medical.pi`, `X-Title: medical-pi`
- model: `OPENROUTER_MODEL`
- non-streaming only (all utility tasks are fire-and-parse)
- used by: `profileService`, `titleService`, `heartbeatService`

---

## Agent Loop (`src/services/agentService.ts`)

```
input:  sessionId, userId, userMessage, attachments[]
output: AsyncGenerator<SSEEvent>

1. load context
   - fetch last CONTEXT_MESSAGE_LIMIT messages from SQLite
   - load MedicalProfile from SQLite
   - replace {MEDICAL_PROFILE_JSON} in system.txt with profile JSON

2. loop:
   a. call modalClient.stream(messages, tools[])
   b. per chunk:
      - thinking token  → yield { event: 'thinking', data: { token } }
      - content token   → yield { event: 'content', data: { token } }, append to buffer
      - tool_call delta → accumulate into ToolCall objects
   c. if no tool calls emitted → break
   d. per tool call:
      - yield { event: 'tool_call', data: { id, name, args } }
      - execute tool (see §Tools)
      - yield { event: 'tool_result', data: { id, name, result } }
      - append assistant tool_call message + tool result message to messages[]
   e. continue loop

3. persist to SQLite: user message + assistant message (content + thinkingContent + toolCalls)
4. async (non-blocking): searchService.indexMessages([userMsg, assistantMsg])
5. yield { event: 'done', data: { messageId, sessionId } }
6. fire-and-forget: profileService.breathe(userId, userMessage, assistantContent)
```

---

## Breathing Profile Update (`src/services/profileService.ts`)

```
breathe(userId, userMessage, assistantContent):
  1. load current profile from SQLite
  2. call openrouterClient with profile-extractor.txt
     input: { exchange: { user: userMessage, assistant: assistantContent }, profileSummary: <top-level fields> }
  3. parse + validate with ProfileDiffSchema (Zod)
     - on schema error: log WARN, return (no write)
  4. if hasNewInfo=false: log DEBUG, return
  5. merge each patch into profile:
     - 'add'    → push to array field, set source='auto', confidence=patch.confidence
     - 'update' → find by id and merge
     - 'remove' → filter out by id
  6. write profile to SQLite (full JSON replace)
  7. insert ProfileDiff into profile_history
  8. if any patch.confidence < PROFILE_MIN_CONFIDENCE: flagged=true
  9. if SSE response still open: emit { event: 'profile_updated', data: { fields, flagged } }
```

---

## Tools

Defined as OpenAI function schemas in `agentService.ts`. Executed in-process.

| Name                  | Source                        | Input                   | Output                                                        |
| --------------------- | ----------------------------- | ----------------------- | ------------------------------------------------------------- |
| `search_sessions`     | Meilisearch `messages` index  | `{ q, limit? }`         | `{ hits: [{ sessionId, sessionTitle, content, createdAt }] }` |
| `get_session`         | SQLite                        | `{ sessionId }`         | `Session & { messages: Message[] }`                           |
| `get_medical_profile` | SQLite                        | `{ fields?: string[] }` | `Partial<MedicalProfile>`                                     |
| `search_documents`    | Meilisearch `documents` index | `{ q, limit? }`         | `{ hits: [{ id, name, snippet }] }`                           |
| `get_document`        | SQLite + filesystem           | `{ documentId }`        | `{ name, extractedContent, mimeType }`                        |
| `web_search`          | Brave Search API              | `{ q }`                 | `{ results: [{ title, url, snippet }] }`                      |
| `memory_pi_search`    | memory-pi REST                | `{ q }`                 | memory-pi response (pass-through)                             |

`web_search` only registered if `BRAVE_SEARCH_API_KEY` is set.
`memory_pi_search` only registered if `MEMORY_PI_ENABLED=true`.

---

## Meilisearch Setup

Two indexes: `messages`, `documents`. No auth (local only).

```
messages:
  searchableAttributes:  ['content', 'session_title']
  filterableAttributes:  ['session_id', 'user_id', 'role', 'created_at']
  sortableAttributes:    ['created_at']

documents:
  searchableAttributes:  ['name', 'extracted_content']
  filterableAttributes:  ['user_id', 'uploaded_at']
```

Systemd user service (`~/.config/systemd/user/meilisearch.service`):

```ini
[Unit]
Description=Meilisearch
After=network.target

[Service]
ExecStart=/usr/local/bin/meilisearch --db-path /data/meilisearch --http-addr 127.0.0.1:7700 --no-analytics
Restart=on-failure

[Install]
WantedBy=default.target
```

Onboarding writes this file and runs `systemctl --user enable --now meilisearch`.

---

## SSE Endpoint (`src/api/routes/chat.ts`)

```
POST /api/chat/:sessionId
Content-Type: multipart/form-data
  fields:  message (string), attachments[] (File, optional)

Response headers:
  Content-Type:      text/event-stream
  Cache-Control:     no-cache
  Connection:        keep-alive
  X-Accel-Buffering: no

Event format:
  data: <JSON>\n\n  (standard SSE, no event: field needed — discriminated by data.event)

On client disconnect: abort Modal stream, stop agent loop generator.
```

---

## API Routes

### Auth

```
POST /api/auth/login     { username }                 → { token, user: User }
GET  /api/auth/me                                     → { user: User }
```

### Sessions

```
GET    /api/sessions            ?page&limit            → Session[]
POST   /api/sessions                                   → Session
GET    /api/sessions/:id                               → Session & { messages: Message[] }
PATCH  /api/sessions/:id        { title?, pinned? }    → Session
DELETE /api/sessions/:id                               → 204
```

### Chat

```
POST /api/chat/:sessionId       multipart              → SSE stream
```

### Profile

```
GET    /api/profile                                    → MedicalProfile
PATCH  /api/profile             partial JSON           → MedicalProfile
GET    /api/profile/history                            → ProfileHistoryEntry[]
DELETE /api/profile/entry/:field/:id                   → 204
```

### Documents

```
GET    /api/documents                                  → MedicalDocument[]
POST   /api/documents           multipart              → MedicalDocument
GET    /api/documents/:id                              → MedicalDocument
DELETE /api/documents/:id                              → 204
```

### Search

```
GET /api/search    ?q=&sessionId=&after=&before=&limit=   → { hits, query }
```

### Health

```
GET /health                                            → { status: 'ok', uptime }
```

---

## Heartbeat Jobs (`src/services/heartbeatService.ts`)

All disabled when `HEARTBEAT_ENABLED=false`.

| Job              | Env var                 | Default        | LLM                                                         |
| ---------------- | ----------------------- | -------------- | ----------------------------------------------------------- |
| Profile review   | `HEARTBEAT_INTERVAL`    | `0 * * * *`    | OpenRouter — scans last 10 sessions for missed profile info |
| Title repair     | `TITLE_REPAIR_CRON`     | `0 2 * * *`    | OpenRouter — generates titles for untitled sessions         |
| Document reindex | `REINDEX_CRON`          | `0 3 * * *`    | none                                                        |
| Meilisearch sync | `MEILI_SYNC_CRON`       | `*/15 * * * *` | none                                                        |
| WhatsApp summary | `WHATSAPP_SUMMARY_CRON` | unset = off    | OpenRouter — daily summary to whatsapp-pi                   |

---

## Auth

- `POST /api/auth/login` upserts user by username, returns signed JWT
- JWT payload: `{ userId, username }`, signed with `JWT_SECRET`, expires `JWT_EXPIRY_DAYS` days
- All routes except `/health` require `Authorization: Bearer <token>`
- Extensibility: add `password_hash TEXT` column to users table + `/api/auth/register` — no other changes needed

---

## Environment Variables (`.env.example`)

```env
PORT=3003
BASE_STORAGE_PATH=/data/medical-pi

MODAL_ENDPOINT=                         # required
MODAL_API_KEY=                          # optional

OPENROUTER_API_KEY=                     # required
OPENROUTER_MODEL=google/gemini-2.0-flash-001

JWT_SECRET=                             # required
JWT_EXPIRY_DAYS=30

MEILISEARCH_HOST=http://127.0.0.1:7700  # local, no auth
MEILISEARCH_DB_PATH=/data/meilisearch

PROFILE_MIN_CONFIDENCE=0.7
CONTEXT_MESSAGE_LIMIT=20

HEARTBEAT_ENABLED=true
HEARTBEAT_INTERVAL=0 * * * *
TITLE_REPAIR_CRON=0 2 * * *
REINDEX_CRON=0 3 * * *
MEILI_SYNC_CRON=*/15 * * * *
WHATSAPP_SUMMARY_CRON=

WHATSAPP_PI_URL=http://127.0.0.1:3001
MEMORY_PI_ENABLED=false
MEMORY_PI_URL=http://127.0.0.1:3002/api
BRAVE_SEARCH_API_KEY=

MAX_DOCUMENT_SIZE_MB=25
LOGGER_PI_URL=http://127.0.0.1:4000
LOGGER_PI_SERVICE_NAME=medical-pi
```

---

## Onboarding Script (`scripts/onboard.js`)

Per guidelines §2:

1. Read existing `.env`, use as defaults
2. Prompt for: `MODAL_ENDPOINT`, `OPENROUTER_API_KEY`, `JWT_SECRET`
3. Ping `MODAL_ENDPOINT/health` — warn if unreachable (may be cold)
4. Ping OpenRouter: 1-token completion to verify key
5. Check for Meilisearch binary:
   - missing → `curl -L https://install.meilisearch.com | sh`
   - write systemd user service file (see §Meilisearch)
   - `systemctl --user enable --now meilisearch`
6. `mkdir -p BASE_STORAGE_PATH/documents BASE_STORAGE_PATH/logs`
7. Run SQLite migrations
8. Create Meilisearch indexes with correct settings
9. Save `.env`
10. `SIGINT` handler: save progress to `.env` and exit cleanly
11. `vitest run`

---

## Build Phases

### Phase 1 — Core Chat + Auth

- [ ] SQLite schema + migrations
- [ ] `modalClient.ts` with streaming + cold-start retry
- [ ] `openrouterClient.ts`
- [ ] Username login + JWT middleware
- [ ] Session CRUD routes
- [ ] `POST /api/chat/:sessionId` — content-only SSE stream
- [ ] React: login page, session list, basic chat view
- [ ] `logger.ts` + graceful shutdown (`SIGINT`/`SIGTERM`)
- [ ] Onboarding script skeleton

**Gate:** login, create session, stream MedGemma response in UI.

### Phase 2 — Breathing Profile

- [ ] `medical_profiles` + `profile_history` tables
- [ ] `profileService.ts`: breathe(), CRUD, history
- [ ] `ProfileDiffSchema` Zod validation
- [ ] `profile-extractor.txt` prompt
- [ ] System prompt with `{MEDICAL_PROFILE_JSON}` injection
- [ ] `/api/profile` routes
- [ ] `profile_updated` SSE event
- [ ] Profile view: sections, auto/manual badges, confidence indicator

**Gate:** mention a condition in chat, see it in the profile with source "auto".

### Phase 3 — Documents + Multimodal

- [ ] `fileStore.ts` + document upload route
- [ ] Text extraction: PDF text layer + MedGemma vision for images
- [ ] Meilisearch `documents` index
- [ ] `search_documents` + `get_document` tools
- [ ] Attachment input in chat UI
- [ ] Documents view

**Gate:** upload a lab image, ask AI about it, get inline analysis.

### Phase 4 — Agent Tools + Reasoning UI

- [ ] Full agent loop with multi-step tool dispatch
- [ ] All tools implemented
- [ ] Meilisearch `messages` index
- [ ] Thinking tokens → collapsible panel
- [ ] Tool call cards in UI
- [ ] `/api/search` + Sessions search view

**Gate:** ask about past session content — search_sessions fires, tool card visible inline.

### Phase 5 — Heartbeat + Polish

- [ ] All cron jobs
- [ ] `titleService.ts` + title auto-generation
- [ ] WhatsApp summary
- [ ] Profile history timeline in UI
- [ ] Full test suite
- [ ] Onboarding script complete

**Gate:** service runs fully autonomous, profile breathes, heartbeat fires on schedule.
