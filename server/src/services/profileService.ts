import { z } from "zod";
import { queries, generateId, now } from "../core/db.js";
import { jsonCompletion } from "../core/openrouterClient.js";
import { zodResponseFormat } from "openai/helpers/zod";
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
    const filtered = currentValue.filter((item: { id: string }) => item.id !== entryId);
    updateProfile(userId, { [fieldKey]: filtered } as Partial<MedicalProfile>);
  }
}

export async function breathe(
  userId: string,
  userMessage: string,
  assistantContent: string
): Promise<{ fields: string[]; flagged: boolean } | null> {
  try {
    const profile = getProfile(userId);
    if (!profile) {
      logger.warn(`Profile not found for breathe: ${userId}`);
      return null;
    }

    // Build profile summary (top-level fields only to save tokens)
    const profileSummary = {
      demographics: profile.demographics,
      currentConditions: profile.currentConditions.map((c) => c.name),
      persistentConditions: profile.persistentConditions.map((c) => c.name),
      pastConditions: profile.pastConditions.map((c) => c.name),
      medications: profile.medications.map((m) => m.name),
      allergies: profile.allergies.map((a) => a.substance),
      lifestyle: profile.lifestyle,
    };

    const prompt = PROFILE_EXTRACTOR_PROMPT.replace(
      "{EXCHANGE}",
      JSON.stringify({ user: userMessage, assistant: assistantContent })
    ).replace("{PROFILE_SUMMARY}", JSON.stringify(profileSummary));

    // Use jsonCompletion to enforce response_format: json_object, preventing markdown code fences
    const response = await jsonCompletion<ProfileDiff>(
      [
        { role: "system", content: prompt },
        {
          role: "user",
          content:
            "Extract any new medical information from this conversation. Return valid JSON only.",
        },
      ],
      zodResponseFormat(ProfileDiffSchema, "ProfileDiff"),
      { temperature: 0.3 },
    );

    // Validate response with Zod
    let diff: ProfileDiff;
    try {
      const parsed = ProfileDiffSchema.parse(response);
      diff = {
        hasNewInfo: parsed.hasNewInfo,
        patches: parsed.patches.map((p) => ({
          field: p.field,
          operation: p.operation,
          value: p.value,
          confidence: p.confidence,
        })),
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`Profile diff schema validation failed: ${errMsg}`);
      return null;
    }

    if (!diff.hasNewInfo || diff.patches.length === 0) {
      logger.debug("No new profile information detected");
      return null;
    }

    // Apply patches
    const updatedProfile: MedicalProfile = { ...profile };
    const updatedFields: string[] = [];
    let flagged = false;

    for (const patch of diff.patches) {
      // Check confidence threshold
      if (patch.confidence < PROFILE_MIN_CONFIDENCE) {
        flagged = true;
      }

      const field = patch.field as keyof MedicalProfile;
      const currentValue = updatedProfile[field];

      if (patch.operation === "add" && Array.isArray(currentValue)) {
        const newItem = {
          ...((patch.value || {}) as Record<string, unknown>),
          id: generateId(),
          source: "auto",
          confidence: patch.confidence,
        };
        (updatedProfile[field] as unknown[]) = [...currentValue, newItem];
        updatedFields.push(field);
      } else if (patch.operation === "update" && Array.isArray(currentValue)) {
        const itemId = (patch.value as { id: string }).id;
        const itemIndex = currentValue.findIndex((item: { id: string }) => item.id === itemId);
        if (itemIndex >= 0) {
          const updatedArray = [...currentValue];
          const currentItem = currentValue[itemIndex];
          if (currentItem && typeof currentItem === "object") {
            updatedArray[itemIndex] = {
              ...currentItem,
              ...(patch.value as Record<string, unknown>),
            };
          }
          (updatedProfile[field] as unknown[]) = updatedArray;
          updatedFields.push(field);
        }
      } else if (patch.operation === "remove" && Array.isArray(currentValue)) {
        const itemId = patch.value as string;
        (updatedProfile[field] as unknown[]) = currentValue.filter(
          (item: { id: string }) => item.id !== itemId
        );
        updatedFields.push(field);
      } else if (patch.operation === "add" || patch.operation === "update") {
        // Handle non-array fields (demographics, lifestyle, freeNotes)
        (updatedProfile[field] as unknown) = patch.value;
        updatedFields.push(field);
      }
    }

    if (updatedFields.length === 0) {
      return null;
    }

    // Save updated profile
    updatedProfile.updatedAt = now();
    queries.updateProfile.run([JSON.stringify(updatedProfile), updatedProfile.updatedAt, userId]);

    // Save to history
    queries.addProfileHistory.run([generateId(), userId, JSON.stringify(diff), now()]);

    logger.info(`Profile updated for user ${userId}`, { fields: updatedFields, flagged });

    return { fields: updatedFields, flagged };
  } catch (error) {
    logger.error("Error in breathe function", error);
    return null;
  }
}
