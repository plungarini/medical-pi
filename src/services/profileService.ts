import { db } from '../core/db.js';
import { complete } from '../core/openrouterClient.js';
import type { MedicalProfile, ProfileDiff, ProfilePatch, ProfileHistoryEntry } from '../types/index.js';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PROFILE_MIN_CONFIDENCE = parseFloat(process.env.PROFILE_MIN_CONFIDENCE || '0.7');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ProfilePatchSchema = z.object({
  field: z.string(),
  operation: z.enum(['add', 'update', 'remove']),
  value: z.unknown(),
  confidence: z.number().min(0).max(1),
});

const ProfileDiffSchema = z.object({
  hasNewInfo: z.boolean(),
  patches: z.array(ProfilePatchSchema),
});

function getDefaultProfile(userId: string): MedicalProfile {
  return {
    userId,
    updatedAt: new Date().toISOString(),
    demographics: {},
    currentConditions: [],
    persistentConditions: [],
    pastConditions: [],
    medications: [],
    allergies: [],
    vitals: [],
    labResults: [],
    surgeries: [],
    familyHistory: [],
    lifestyle: {},
  };
}

export function getProfile(userId: string): MedicalProfile {
  const row = db.prepare('SELECT profile FROM medical_profiles WHERE user_id = ?').get(userId) as
    | { profile: string }
    | undefined;

  if (!row) {
    return getDefaultProfile(userId);
  }

  return JSON.parse(row.profile) as MedicalProfile;
}

export function updateProfile(userId: string, updates: Partial<MedicalProfile>): MedicalProfile {
  const existing = getProfile(userId);
  const updated: MedicalProfile = {
    ...existing,
    ...updates,
    userId,
    updatedAt: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO medical_profiles (user_id, profile, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET profile = excluded.profile, updated_at = excluded.updated_at`
  ).run(userId, JSON.stringify(updated), updated.updatedAt);

  return updated;
}

export function getProfileHistory(userId: string, limit = 50): ProfileHistoryEntry[] {
  const rows = db
    .prepare('SELECT * FROM profile_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(userId, limit) as Array<{
    id: string;
    user_id: string;
    diff: string;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    diff: JSON.parse(r.diff) as ProfileDiff,
    createdAt: r.created_at,
  }));
}

export function deleteProfileEntry(userId: string, field: string, entryId: string): MedicalProfile {
  const profile = getProfile(userId);
  const fieldKey = field as keyof MedicalProfile;

  if (Array.isArray(profile[fieldKey])) {
    (profile[fieldKey] as unknown[]) = (profile[fieldKey] as unknown[]).filter(
      (item: unknown) => (item as { id: string }).id !== entryId
    );
  }

  profile.updatedAt = new Date().toISOString();

  db.prepare('UPDATE medical_profiles SET profile = ?, updated_at = ? WHERE user_id = ?').run(
    JSON.stringify(profile),
    profile.updatedAt,
    userId
  );

  return profile;
}

export async function breathe(
  userId: string,
  userMessage: string,
  assistantContent: string
): Promise<{ fields: string[]; flagged: boolean } | null> {
  try {
    const profile = getProfile(userId);

    // Create a summary of top-level profile fields for context
    const profileSummary = {
      demographics: profile.demographics,
      currentConditions: profile.currentConditions.map((c) => c.name),
      persistentConditions: profile.persistentConditions.map((c) => c.name),
      pastConditions: profile.pastConditions.map((c) => c.name),
      medications: profile.medications.map((m) => m.name),
      allergies: profile.allergies.map((a) => a.substance),
      vitals: profile.vitals.map((v) => `${v.type}: ${v.value}`),
      labResults: profile.labResults.map((l) => l.name),
      surgeries: profile.surgeries.map((s) => s.name),
      familyHistory: profile.familyHistory.map((f) => `${f.relation}: ${f.condition}`),
      lifestyle: profile.lifestyle,
    };

    // Load prompt
    const promptPath = path.join(__dirname, '../../prompts/profile-extractor.txt');
    let promptTemplate: string;
    try {
      promptTemplate = fs.readFileSync(promptPath, 'utf-8');
    } catch {
      console.warn('Profile extractor prompt not found, using default');
      promptTemplate =
        'Extract any new medical information from the conversation and return as JSON with ProfileDiff structure.';
    }

    const prompt = promptTemplate
      .replace('{EXCHANGE}', JSON.stringify({ user: userMessage, assistant: assistantContent }))
      .replace('{PROFILE_SUMMARY}', JSON.stringify(profileSummary));

    const response = await complete(
      [
        {
          role: 'system',
          content:
            'You are a medical information extractor. Analyze the conversation and extract any new medical information. Return a JSON object matching the ProfileDiff schema.',
        },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.2 }
    );

    let parsed: unknown;
    try {
      parsed = JSON.parse(response);
    } catch {
      // Try to extract JSON from markdown
      const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error('Invalid JSON response');
      }
    }

    const validationResult = ProfileDiffSchema.safeParse(parsed);
    if (!validationResult.success) {
      console.warn('Profile diff schema validation failed:', validationResult.error);
      return null;
    }

    const diff = validationResult.data;

    if (!diff.hasNewInfo || diff.patches.length === 0) {
      console.debug('No new profile information detected');
      return null;
    }

    // Apply patches
    const updatedProfile = { ...profile };
    const updatedFields: string[] = [];
    let hasLowConfidence = false;

    for (const patch of diff.patches) {
      if (patch.confidence < PROFILE_MIN_CONFIDENCE) {
        hasLowConfidence = true;
      }

      const field = patch.field as keyof MedicalProfile;
      updatedFields.push(String(field));

      if (Array.isArray(updatedProfile[field])) {
        const arr = updatedProfile[field] as unknown[];
        if (patch.operation === 'add') {
          arr.push({
            ...(patch.value as object),
            source: 'auto',
            confidence: patch.confidence,
          });
        } else if (patch.operation === 'update') {
          const idx = arr.findIndex((item) => (item as { id: string }).id === (patch.value as { id: string }).id);
          if (idx >= 0) {
            arr[idx] = {
              ...patch.value,
              source: 'auto',
              confidence: patch.confidence,
            };
          }
        } else if (patch.operation === 'remove') {
          const idx = arr.findIndex((item) => (item as { id: string }).id === (patch.value as { id: string }).id);
          if (idx >= 0) {
            arr.splice(idx, 1);
          }
        }
      } else if (typeof updatedProfile[field] === 'object' && field !== 'userId' && field !== 'updatedAt') {
        updatedProfile[field] = { ...updatedProfile[field], ...(patch.value as object) } as never;
      }
    }

    updatedProfile.updatedAt = new Date().toISOString();

    // Save profile
    db.prepare(
      `INSERT INTO medical_profiles (user_id, profile, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET profile = excluded.profile, updated_at = excluded.updated_at`
    ).run(userId, JSON.stringify(updatedProfile), updatedProfile.updatedAt);

    // Save history
    db.prepare('INSERT INTO profile_history (id, user_id, diff, created_at) VALUES (?, ?, ?, ?)').run(
      uuidv4(),
      userId,
      JSON.stringify(diff),
      new Date().toISOString()
    );

    return { fields: [...new Set(updatedFields)], flagged: hasLowConfidence };
  } catch (error) {
    console.error('Profile breathing failed:', error);
    return null;
  }
}
