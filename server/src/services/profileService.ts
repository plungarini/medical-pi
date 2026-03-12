import { z } from "zod";
import { queries, generateId, now } from "../core/db.js";
import { jsonCompletion } from "../core/openrouterClient.js";
import { logger } from "../core/logger.js";
import type { MedicalProfile, ProfileDiff, ProfileHistoryEntry } from "../types/index.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROFILE_MIN_CONFIDENCE = Number.parseFloat(process.env.PROFILE_MIN_CONFIDENCE ?? "0.7");

// Load profile extractor prompt
const PROFILE_EXTRACTOR_PROMPT = fs.readFileSync(
  path.join(__dirname, "../../../prompts/profile-extractor.txt"),
  "utf-8"
);

// Zod schema for profile diff validation
export const ProfileDiffSchema = z.object({
  hasNewInfo: z.boolean(),
  patches: z.array(
    z.object({
      field: z.string(),
      operation: z.enum(["add", "update", "remove"]),
      value: z.unknown(),
      confidence: z.number().min(0).max(1),
      notes: z.string(),
      recordedAt: z.string().optional(),
    })
  ),
});

export function getProfile(userId: string): MedicalProfile | null {
  const row = queries.getProfile.get([userId]) as
    | { user_id: string; profile: string; updated_at: string }
    | undefined;

  if (!row) {
    // Create default profile
    const defaultProfile: MedicalProfile = {
      userId,
      updatedAt: now(),
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
    queries.createProfile.run([userId, JSON.stringify(defaultProfile), defaultProfile.updatedAt]);
    return defaultProfile;
  }

  return JSON.parse(row.profile) as MedicalProfile;
}

export function updateProfile(
  userId: string,
  updates: Partial<MedicalProfile>
): MedicalProfile {
  const current = getProfile(userId);
  if (!current) {
    throw new Error(`Profile not found for user ${userId}`);
  }

  const updated: MedicalProfile = {
    ...current,
    ...updates,
    userId, // Ensure userId is preserved
    updatedAt: now(),
  };

  queries.updateProfile.run([JSON.stringify(updated), updated.updatedAt, userId]);

  return updated;
}

export function getProfileHistory(userId: string, limit = 50): ProfileHistoryEntry[] {
  const rows = queries.getProfileHistory.all([userId, limit]) as Array<{
    id: string;
    user_id: string;
    diff: string;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    diff: JSON.parse(row.diff) as ProfileDiff,
    createdAt: row.created_at,
  }));
}

export function updateProfileEntry(
  userId: string,
  field: string,
  entryId: string,
  updates: any
): void {
  const profile = getProfile(userId);
  if (!profile) {
    throw new Error(`Profile not found for user ${userId}`);
  }

  const fieldKey = field as keyof MedicalProfile;
  const currentValue = profile[fieldKey];

  if (Array.isArray(currentValue)) {
    const updatedArray = currentValue.map((item: any) => {
      if (item.id === entryId) {
        return { ...item, ...updates, updatedAt: now() };
      }
      return item;
    });
    updateProfile(userId, { [fieldKey]: updatedArray } as Partial<MedicalProfile>);
  } else if (currentValue && typeof currentValue === "object") {
    // Handle objects (like lifestyle or demographics)
    const updatedObject = {
      ...currentValue,
      [entryId]: updates.notes || updates // Use notes if present (from UI dialog), otherwise updates
    };
    updateProfile(userId, { [fieldKey]: updatedObject } as Partial<MedicalProfile>);
  }
}

export function deleteProfileEntry(
  userId: string,
  field: string,
  entryId: string
): void {
  const profile = getProfile(userId);
  if (!profile) {
    throw new Error(`Profile not found for user ${userId}`);
  }

  const fieldKey = field as keyof MedicalProfile;
  const currentValue = profile[fieldKey];

  if (Array.isArray(currentValue)) {
    const filtered = currentValue.filter((item: any) => item.id !== entryId);
    updateProfile(userId, { [fieldKey]: filtered } as Partial<MedicalProfile>);
  } else if (currentValue && typeof currentValue === "object") {
    // Handle objects: remove the key
    const updatedObject = { ...currentValue };
    delete (updatedObject as any)[entryId];
    updateProfile(userId, { [fieldKey]: updatedObject } as Partial<MedicalProfile>);
  }
}

export async function breathe(
  userId: string,
  userMessage: string,
  assistantContent: string
): Promise<void> {
  // Fire-and-forget: catch all errors and log them
  try {
    const profile = getProfile(userId);
    if (!profile) {
      logger.warn(`Profile not found for breathe: ${userId}`);
      return;
    }

    // Build profile summary (top-level fields for context)
    const profileSummary = {
      demographics: profile.demographics,
      currentConditions: profile.currentConditions.map((c) => c.name),
      persistentConditions: profile.persistentConditions.map((c) => c.name),
      pastConditions: profile.pastConditions.map((c) => c.name),
      medications: profile.medications.map((m) => m.name),
      allergies: profile.allergies.map((a) => a.substance),
      lifestyle: profile.lifestyle,
    };

    const prompt = PROFILE_EXTRACTOR_PROMPT
      .replace("{profileSummary}", JSON.stringify(profileSummary))
      .replace("{exchange}", JSON.stringify({ user: userMessage, assistant: assistantContent }))
      .replace("{currentTime}", now());

    // Enforce JSON format using OpenRouter jsonCompletion
    const response = await jsonCompletion<ProfileDiff>(
      [{ role: "user", content: prompt }],
      null, // Allow default json_object mode
      { temperature: 0.1, maxTokens: 2048 }
    );

    // Validate with Zod
    const validation = ProfileDiffSchema.safeParse(response);
    if (!validation.success) {
      logger.warn(`breathe: Profile diff validation failed for user ${userId}`, validation.error);
      return;
    }
    const diff = validation.data;

    if (!diff.hasNewInfo || !diff.patches || diff.patches.length === 0) {
      logger.debug(`breathe: no new info for user ${userId}`);
      return;
    }

    // Apply patches
    const updatedProfile: MedicalProfile = { ...profile };
    const updatedFields: string[] = [];
    let flagged = false;

    for (const patch of diff.patches) {
      if (patch.confidence < PROFILE_MIN_CONFIDENCE) {
        flagged = true;
      }

      const field = patch.field as keyof Omit<MedicalProfile, 'userId' | 'updatedAt'>;
      const currentValue = updatedProfile[field];

      if (patch.operation === "add" && Array.isArray(currentValue)) {
        const newItem = {
          ...(patch.value as Record<string, unknown>),
          id: generateId(),
          source: "auto",
          confidence: patch.confidence,
          notes: patch.notes,
          recordedAt: patch.recordedAt || now(), // Default to current time if AI omits it
        };
        (updatedProfile[field] as unknown[]) = [...currentValue, newItem];
        updatedFields.push(field);
      } else if (patch.operation === "update" && Array.isArray(currentValue)) {
        const value = patch.value as { id: string };
        const itemIndex = currentValue.findIndex((item: any) => item.id === value.id);
        if (itemIndex >= 0) {
          const updatedArray = [...currentValue];
          updatedArray[itemIndex] = {
            ...updatedArray[itemIndex],
            ...value,
          };
          (updatedProfile[field] as unknown[]) = updatedArray;
          updatedFields.push(field);
        }
      } else if (patch.operation === "remove" && Array.isArray(currentValue)) {
        const itemId = (patch.value as { id: string }).id;
        (updatedProfile[field] as unknown[]) = currentValue.filter(
          (item: any) => item.id !== itemId
        );
        updatedFields.push(field);
      } else if (patch.operation === "add" || patch.operation === "update") {
        // Handle non-array fields
        (updatedProfile[field] as unknown) = patch.value;
        updatedFields.push(field);
      }
    }

    if (updatedFields.length === 0) return;

    // Save update
    updatedProfile.updatedAt = now();
    queries.updateProfile.run([JSON.stringify(updatedProfile), updatedProfile.updatedAt, userId]);

    // Save history
    queries.addProfileHistory.run([generateId(), userId, JSON.stringify(diff), now()]);

    logger.info(`breathe: profile updated for ${userId}`, { updatedFields, flagged });

    // Emit live event
    const { emitLiveEvent } = await import("./eventService.js");
    emitLiveEvent(userId, "profile_updated", { fields: updatedFields, flagged });

  } catch (error) {
    logger.error(`breathe failed for user ${userId}`, error);
  }
}
