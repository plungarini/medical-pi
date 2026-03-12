# medical-pi — Fix & Complete Plan

Focused spec for the AI coding agent. Four areas to audit and fix/implement.

---

## 0. Prompts Consolidation (do this first)

All prompt files must live in `medical-pi/prompts/`. None should be in `server/prompts/` or anywhere else.

**Task:**
1. Check if `server/prompts/` exists. If it does, move all `.txt` files from it into `medical-pi/prompts/`.
2. Delete `server/prompts/` after moving.
3. Update any code that references `server/prompts/` or a relative path like `../../prompts/` — all prompt load paths must resolve to `medical-pi/prompts/`.

Expected final state:
```
medical-pi/
  prompts/
    system.txt
    profile-extractor.txt
    session-title.txt
```

**Also update the prompts content** (except `system.txt`) to reflect the correct TypeScript schemas from `server/src/types/index.ts`. Specifically:

`profile-extractor.txt` — the output schema it requests must exactly match `ProfileDiff`:
```typescript
interface ProfileDiff {
  hasNewInfo: boolean;
  patches: ProfilePatch[];
}
interface ProfilePatch {
  field: keyof Omit<MedicalProfile, 'userId' | 'updatedAt'>;
  operation: 'add' | 'update' | 'remove';
  value: unknown;
  confidence: number; // 0–1
}
```
The prompt must instruct the model to return **only JSON**, no markdown, no preamble.

`session-title.txt` — must instruct the model to return a **plain string of max 8 words**, no JSON, no quotes, no preamble.

---

## 1. Breathing Profile

**What it should do:** After every assistant response, `profileService.breathe()` is called fire-and-forget. It sends the exchange to OpenRouter, parses the `ProfileDiff`, merges patches into the SQLite profile, and optionally emits a `profile_updated` SSE event if the stream is still open.

**Check if it exists:** Look for `server/src/services/profileService.ts`. Check if `breathe()` is defined and called from `agentService.ts` after `yield { event: 'done' }`.

**If missing or broken, implement:**

```
// server/src/services/profileService.ts

breathe(userId: string, userMessage: string, assistantContent: string): void
  // fire-and-forget — never await this, never throw to caller
  1. load current profile from SQLite: SELECT profile FROM medical_profiles WHERE user_id = ?
     - if no row: insert empty profile first, then proceed
  2. load prompt from medical-pi/prompts/profile-extractor.txt
  3. call openrouterClient.chat.completions.create (non-streaming):
     messages: [
       { role: 'user', content: <prompt with interpolated exchange + profileSummary> }
     ]
     max_tokens: 512
  4. parse response.choices[0].message.content as JSON
  5. validate with ProfileDiffSchema (Zod) — on failure: log WARN, return
  6. if diff.hasNewInfo === false: log DEBUG 'breathe: no new info', return
  7. load full profile object from SQLite
  8. for each patch in diff.patches:
     - 'add':    profile[patch.field].push({ ...patch.value, id: uuid(), source: 'auto', confidence: patch.confidence })
     - 'update': find item by id in profile[patch.field], merge patch.value into it
     - 'remove': profile[patch.field] = profile[patch.field].filter(x => x.id !== patch.value.id)
  9. profile.updatedAt = new Date().toISOString()
  10. UPDATE medical_profiles SET profile = ?, updated_at = ? WHERE user_id = ?
  11. INSERT INTO profile_history (id, user_id, diff, created_at) VALUES (uuid(), userId, JSON, now)
  12. if any patch.confidence < PROFILE_MIN_CONFIDENCE: flagged = true
  13. emit profile_updated SSE if stream ref is still open (use weak ref or passed callback)
```

**Integration point in agentService.ts:**
```typescript
// step 6 — after yield done
// do NOT await
void profileService.breathe(userId, userMessage, assistantContent).catch(err =>
  logger.warn('breathe failed', err)
);
```

**Profile injection in agent loop:**
```typescript
// step 1 — context load
const profileRow = db.prepare('SELECT profile FROM medical_profiles WHERE user_id = ?').get(userId);
const profile: MedicalProfile = profileRow ? JSON.parse(profileRow.profile) : emptyProfile();
const systemPrompt = systemTxt.replace('{MEDICAL_PROFILE_JSON}', JSON.stringify(profile));
```
The system prompt must be injected as the **first user message** (not a system role), because MedGemma/Gemma does not support the system role — inject it prepended to the first user message content:
```typescript
const messagesWithSystem = [
  { role: 'user', content: `${systemPrompt}\n\n---\n\n${firstUserMessage}` },
  ...remainingMessages
];
```

---

## 2. Heartbeat Jobs

**What it should do:** `heartbeatService.ts` registers node-cron jobs on server startup. Jobs run on schedule, all skipped when `HEARTBEAT_ENABLED=false`.

**Check if it exists:** Look for `server/src/services/heartbeatService.ts`. Check if it's imported and started in `server/src/index.ts` or `server.ts`.

**If missing or broken, implement:**

```typescript
// server/src/services/heartbeatService.ts

import cron from 'node-cron';

export function startHeartbeat() {
  if (process.env.HEARTBEAT_ENABLED === 'false') return;

  // Profile review — scan last 10 sessions for missed profile info
  cron.schedule(process.env.HEARTBEAT_INTERVAL ?? '0 * * * *', async () => {
    try {
      const sessions = db.prepare(`
        SELECT s.id, s.user_id FROM sessions s
        ORDER BY s.updated_at DESC LIMIT 10
      `).all();
      for (const session of sessions) {
        const messages = db.prepare(`
          SELECT role, content FROM messages
          WHERE session_id = ? ORDER BY created_at ASC LIMIT 20
        `).all(session.id);
        if (messages.length < 2) continue;
        const exchange = messages.slice(-2); // last user+assistant pair
        await profileService.breathe(session.user_id, exchange[0].content, exchange[1].content);
      }
    } catch (err) { logger.warn('heartbeat profile review failed', err); }
  });

  // Title repair — generate titles for sessions with empty title
  cron.schedule(process.env.TITLE_REPAIR_CRON ?? '0 2 * * *', async () => {
    try {
      const untitled = db.prepare(`
        SELECT id, user_id FROM sessions WHERE title = '' OR title IS NULL LIMIT 20
      `).all();
      for (const session of untitled) {
        await titleService.generateAndSave(session.id);
      }
    } catch (err) { logger.warn('heartbeat title repair failed', err); }
  });

  // Document reindex
  cron.schedule(process.env.REINDEX_CRON ?? '0 3 * * *', async () => {
    try { await documentService.reindexAll(); }
    catch (err) { logger.warn('heartbeat reindex failed', err); }
  });

  // Meilisearch sync
  cron.schedule(process.env.MEILI_SYNC_CRON ?? '*/15 * * * *', async () => {
    try { await searchService.syncPending(); }
    catch (err) { logger.warn('heartbeat meili sync failed', err); }
  });
}
```

Start it in `server/src/index.ts`:
```typescript
import { startHeartbeat } from './services/heartbeatService.js';
// after server starts:
startHeartbeat();
```

---

## 3. Session/Chat Title Generation

**What it should do:** After the first assistant response in a new session, `titleService.generateAndSave()` is called fire-and-forget. It sends the first exchange to OpenRouter, gets a plain-text title (max 8 words), and writes it to the sessions table.

**Check if it exists:** Look for `server/src/services/titleService.ts`. Check if it's called from `agentService.ts` and if there's a condition to only trigger on the first message of a session.

**If missing or broken, implement:**

```typescript
// server/src/services/titleService.ts

export async function generateAndSave(sessionId: string): Promise<void> {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session) return;
  if (session.title && session.title.trim() !== '') return; // already has title

  const messages = db.prepare(`
    SELECT role, content FROM messages
    WHERE session_id = ? ORDER BY created_at ASC LIMIT 4
  `).all(sessionId);
  if (messages.length < 2) return;

  const prompt = fs.readFileSync(path.join(PROMPTS_DIR, 'session-title.txt'), 'utf-8');
  const exchange = messages.slice(0, 2).map(m => `${m.role}: ${m.content}`).join('\n');

  const res = await openrouterClient.chat.completions.create({
    model: process.env.OPENROUTER_MODEL!,
    messages: [{ role: 'user', content: prompt.replace('{EXCHANGE}', exchange) }],
    max_tokens: 32,
  });

  const title = res.choices[0].message.content?.trim().replace(/^["']|["']$/g, '') ?? '';
  if (!title) return;

  db.prepare('UPDATE sessions SET title = ? WHERE id = ?').run(title, sessionId);
}
```

**Integration point in agentService.ts:**
```typescript
// after yield done — only trigger if session.messageCount === 1 (first exchange)
const session = db.prepare('SELECT message_count FROM sessions WHERE id = ?').get(sessionId);
if (session.message_count <= 2) { // user + first assistant = 2
  void titleService.generateAndSave(sessionId).catch(err =>
    logger.warn('title generation failed', err)
  );
}
```

`session-title.txt` prompt template:
```
You are generating a short title for a medical chat session. Given the first exchange below, output a title of maximum 8 words. Output only the title, no quotes, no punctuation at the end, no explanation.

{EXCHANGE}
```

---

## 4. Profile Injection Verification Checklist

Even if breathing is implemented, profile injection can silently fail. Verify all of these:

- [ ] `medical_profiles` table exists with correct schema (check migrations in `db.ts`)
- [ ] On first login/first chat, if no profile row exists, insert an empty one — do not assume it exists
- [ ] `system.txt` contains `{MEDICAL_PROFILE_JSON}` placeholder exactly as a string literal
- [ ] The replacement happens in `agentService.ts` before building the messages array, not lazily
- [ ] The injected system content goes into the **first user message**, not as a `{ role: 'system' }` message — MedGemma will ignore or mishandle a system role
- [ ] If profile is empty `{}`, inject a compact empty representation, not null or undefined
- [ ] Log the profile JSON being injected at DEBUG level so you can verify it during testing

**Verify with this test:** Set a condition manually in the profile via `PATCH /api/server/profile`, then send a chat message and check the server logs to confirm the profile JSON appears in the first user message sent to Modal.

---

## Summary of Files to Create/Fix

| File | Action |
|---|---|
| `medical-pi/prompts/profile-extractor.txt` | Move from server/prompts if exists, update schema |
| `medical-pi/prompts/session-title.txt` | Move from server/prompts if exists, update template |
| `server/src/services/profileService.ts` | Audit/implement `breathe()` |
| `server/src/services/titleService.ts` | Audit/implement `generateAndSave()` |
| `server/src/services/heartbeatService.ts` | Audit/implement all cron jobs |
| `server/src/services/agentService.ts` | Verify: profile injection, breathe() call, title trigger |
| `server/src/index.ts` | Verify: `startHeartbeat()` called on boot |
