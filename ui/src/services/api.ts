import { getToken } from './auth';
import type {
  Session,
  Message,
  MedicalProfile,
  MedicalDocument,
  ProfileHistoryEntry,
  SSEEvent,
} from '../../../src/types';

function getHeaders(): Record<string, string> {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}

// Auth
export async function login(username: string): Promise<{ token: string; user: { id: string; username: string } }> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  if (!response.ok) throw new Error('Login failed');
  return response.json();
}

// Sessions
export async function getSessions(page = 1, limit = 20): Promise<Session[]> {
  const response = await fetch(`/api/sessions?page=${page}&limit=${limit}`, {
    headers: getHeaders(),
  });
  if (!response.ok) throw new Error('Failed to fetch sessions');
  return response.json();
}

export async function createSession(): Promise<Session> {
  const response = await fetch('/api/sessions', {
    method: 'POST',
    headers: getHeaders(),
  });
  if (!response.ok) throw new Error('Failed to create session');
  return response.json();
}

export async function getSession(id: string): Promise<Session & { messages: Message[] }> {
  const response = await fetch(`/api/sessions/${id}`, {
    headers: getHeaders(),
  });
  if (!response.ok) throw new Error('Failed to fetch session');
  return response.json();
}

export async function updateSession(id: string, updates: Partial<Session>): Promise<Session> {
  const response = await fetch(`/api/sessions/${id}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(updates),
  });
  if (!response.ok) throw new Error('Failed to update session');
  return response.json();
}

export async function deleteSession(id: string): Promise<void> {
  const response = await fetch(`/api/sessions/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!response.ok) throw new Error('Failed to delete session');
}

// Chat
export function streamChat(
  sessionId: string,
  message: string,
  attachments: File[],
  onEvent: (event: SSEEvent) => void,
  onError: (error: Error) => void,
  onComplete: () => void
): () => void {
  const token = getToken();
  const formData = new FormData();
  formData.append('message', message);
  attachments.forEach((file) => formData.append('attachments', file));

  const abortController = new AbortController();

  fetch(`/api/chat/${sessionId}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
    signal: abortController.signal,
  }).then(async (response) => {
    if (!response.ok) {
      onError(new Error('Chat request failed'));
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      onError(new Error('No response body'));
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          const dataMatch = trimmed.match(/^data: (.+)$/m);
          if (dataMatch) {
            try {
              const event = JSON.parse(dataMatch[1]) as SSEEvent;
              onEvent(event);

              if (event.event === 'done' || event.event === 'error') {
                onComplete();
              }
            } catch (e) {
              console.error('Failed to parse SSE event:', e);
            }
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        onError(error as Error);
      }
    }
  });

  return () => abortController.abort();
}

// Profile
export async function getProfile(): Promise<MedicalProfile> {
  const response = await fetch('/api/profile', {
    headers: getHeaders(),
  });
  if (!response.ok) throw new Error('Failed to fetch profile');
  return response.json();
}

export async function updateProfile(updates: Partial<MedicalProfile>): Promise<MedicalProfile> {
  const response = await fetch('/api/profile', {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(updates),
  });
  if (!response.ok) throw new Error('Failed to update profile');
  return response.json();
}

export async function getProfileHistory(): Promise<ProfileHistoryEntry[]> {
  const response = await fetch('/api/profile/history', {
    headers: getHeaders(),
  });
  if (!response.ok) throw new Error('Failed to fetch profile history');
  return response.json();
}

export async function deleteProfileEntry(field: string, id: string): Promise<void> {
  const response = await fetch(`/api/profile/entry/${field}/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!response.ok) throw new Error('Failed to delete profile entry');
}

// Documents
export async function getDocuments(): Promise<MedicalDocument[]> {
  const response = await fetch('/api/documents', {
    headers: getHeaders(),
  });
  if (!response.ok) throw new Error('Failed to fetch documents');
  return response.json();
}

export async function uploadDocument(file: File): Promise<MedicalDocument> {
  const token = getToken();
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/documents', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!response.ok) throw new Error('Failed to upload document');
  return response.json();
}

export async function deleteDocument(id: string): Promise<void> {
  const response = await fetch(`/api/documents/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!response.ok) throw new Error('Failed to delete document');
}

// Search
export async function search(
  q: string,
  options: { sessionId?: string; after?: string; before?: string; limit?: number } = {}
): Promise<{ hits: unknown[]; query: string }> {
  const params = new URLSearchParams({ q });
  if (options.sessionId) params.append('sessionId', options.sessionId);
  if (options.after) params.append('after', options.after);
  if (options.before) params.append('before', options.before);
  if (options.limit) params.append('limit', options.limit.toString());

  const response = await fetch(`/api/search?${params}`, {
    headers: getHeaders(),
  });
  if (!response.ok) throw new Error('Search failed');
  return response.json();
}
