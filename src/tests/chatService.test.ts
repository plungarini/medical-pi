import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSession,
  getSession,
  getSessions,
  updateSession,
  deleteSession,
  createMessage,
  getRecentMessages,
} from '../services/chatService.js';
import { db } from '../core/db.js';
import { v4 as uuidv4 } from 'uuid';

describe('Chat Service', () => {
  const testUserId = uuidv4();

  beforeEach(() => {
    // Clean up test data
    db.prepare('DELETE FROM messages WHERE session_id IN (SELECT id FROM sessions WHERE user_id = ?)').run(testUserId);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(testUserId);
  });

  it('should create a session', () => {
    const session = createSession(testUserId, 'Test Session');

    expect(session).toBeDefined();
    expect(session.userId).toBe(testUserId);
    expect(session.title).toBe('Test Session');
    expect(session.messageCount).toBe(0);
  });

  it('should get a session with messages', () => {
    const session = createSession(testUserId);
    createMessage(session.id, 'user', 'Hello');
    createMessage(session.id, 'assistant', 'Hi there!');

    const retrieved = getSession(testUserId, session.id);

    expect(retrieved).toBeDefined();
    expect(retrieved?.messages).toHaveLength(2);
  });

  it('should not get session from another user', () => {
    const session = createSession(testUserId);
    const otherUserId = uuidv4();

    const retrieved = getSession(otherUserId, session.id);

    expect(retrieved).toBeNull();
  });

  it('should list sessions ordered by updated_at', () => {
    const session1 = createSession(testUserId, 'Session 1');
    const session2 = createSession(testUserId, 'Session 2');

    const sessions = getSessions(testUserId);

    expect(sessions).toHaveLength(2);
    expect(sessions[0].id).toBe(session2.id); // Most recent first
    expect(sessions[1].id).toBe(session1.id);
  });

  it('should update session', () => {
    const session = createSession(testUserId, 'Old Title');

    const updated = updateSession(testUserId, session.id, {
      title: 'New Title',
      pinned: true,
    });

    expect(updated?.title).toBe('New Title');
    expect(updated?.pinned).toBe(true);
  });

  it('should delete session', () => {
    const session = createSession(testUserId);

    const deleted = deleteSession(testUserId, session.id);

    expect(deleted).toBe(true);
    expect(getSession(testUserId, session.id)).toBeNull();
  });

  it('should create messages', () => {
    const session = createSession(testUserId);

    const message = createMessage(session.id, 'user', 'Test message');

    expect(message).toBeDefined();
    expect(message.sessionId).toBe(session.id);
    expect(message.content).toBe('Test message');
    expect(message.role).toBe('user');

    // Check session message count updated
    const updatedSession = getSession(testUserId, session.id);
    expect(updatedSession?.messageCount).toBe(1);
  });

  it('should get recent messages', () => {
    const session = createSession(testUserId);

    // Create 25 messages
    for (let i = 0; i < 25; i++) {
      createMessage(session.id, 'user', `Message ${i}`);
    }

    const recent = getRecentMessages(session.id, 10);

    expect(recent).toHaveLength(10);
    expect(recent[9].content).toBe('Message 24'); // Most recent
  });
});
