import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { generateId, now, queries } from '../core/db.js';
import { logger } from '../core/logger.js';
import { jsonCompletion } from '../core/openrouterClient.js';
import type { MedicalProfile, ProfileDiff, ProfileHistoryEntry, ProfilePatch } from '../types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROFILE_MIN_CONFIDENCE = Number.parseFloat(process.env.PROFILE_MIN_CONFIDENCE ?? '0.7');

// Load profile extractor prompt
const PROFILE_EXTRACTOR_PROMPT = fs.readFileSync(
	path.join(__dirname, '../../../prompts/profile-extractor.txt'),
	'utf-8',
);

// Zod schema for profile diff validation
export const ProfileDiffSchema = z.object({
	hasNewInfo: z.boolean(),
	patches: z.array(
		z.object({
			field: z.string(),
			operation: z.enum(['add', 'update', 'remove']),
			value: z.unknown(),
			confidence: z.number().min(0).max(1),
			notes: z.string(),
			recordedAt: z.string().optional(),
		}),
	),
});

export function getProfile(userId: string): MedicalProfile | null {
	const row = queries.getProfile.get([userId]) as { user_id: string; profile: string; updated_at: string } | undefined;

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

export function updateProfile(userId: string, updates: Partial<MedicalProfile>): MedicalProfile {
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

export function updateProfileEntry(userId: string, field: string, entryId: string, updates: any): void {
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
	} else if (currentValue && typeof currentValue === 'object') {
		// Handle objects (like lifestyle or demographics)
		const updatedObject = {
			...currentValue,
			[entryId]: updates.notes || updates, // Use notes if present (from UI dialog), otherwise updates
		};
		updateProfile(userId, { [fieldKey]: updatedObject } as Partial<MedicalProfile>);
	}
}

export function deleteProfileEntry(userId: string, field: string, entryId: string): void {
	const profile = getProfile(userId);
	if (!profile) {
		throw new Error(`Profile not found for user ${userId}`);
	}

	const fieldKey = field as keyof MedicalProfile;
	const currentValue = profile[fieldKey];

	if (Array.isArray(currentValue)) {
		const filtered = currentValue.filter((item: any) => item.id !== entryId);
		updateProfile(userId, { [fieldKey]: filtered } as Partial<MedicalProfile>);
	} else if (currentValue && typeof currentValue === 'object') {
		// Handle objects: remove the key
		const updatedObject = { ...currentValue };
		delete (updatedObject as any)[entryId];
		updateProfile(userId, { [fieldKey]: updatedObject } as Partial<MedicalProfile>);
	}
}

export async function breathe(
	userId: string,
	userMessage: string,
	assistantContent: string,
	assistantMessageId?: string,
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

		const exchange = JSON.stringify({ user: userMessage, assistant: assistantContent });
		const prompt = PROFILE_EXTRACTOR_PROMPT.replace('{profileSummary}', JSON.stringify(profileSummary))
			.replace('{exchange}', exchange)
			.replace('{currentTime}', now());

		// Enforce JSON format using OpenRouter jsonCompletion
		// Convert Zod schema to JSON Schema for Structured Outputs
		const { zodToJsonSchema } = await import('zod-to-json-schema');
		const jsonSchema = zodToJsonSchema(ProfileDiffSchema, 'ProfileDiff');
		const finalSchema = (jsonSchema.definitions?.ProfileDiff ?? jsonSchema) as any;

		// Remove unsupported properties for OpenAI/OpenRouter strict mode if any
		if (finalSchema.additionalProperties === undefined) {
			finalSchema.additionalProperties = false;
		}

		const response = await jsonCompletion<ProfileDiff>([{ role: 'user', content: prompt }], finalSchema, {
			temperature: 0.1,
			maxTokens: 4096,
		});

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
		// Apply patches
		const updatedFields = applyPatches(updatedProfile, diff.patches as ProfilePatch[]);

		if (updatedFields.length === 0) return logger.debug(`breathe: no updates for user ${userId}`);

		// Save update
		updatedProfile.updatedAt = now();
		queries.updateProfile.run([JSON.stringify(updatedProfile), updatedProfile.updatedAt, userId]);

		// Save history
		queries.addProfileHistory.run([generateId(), userId, JSON.stringify(diff), now()]);

		logger.info(`breathe: profile updated for ${userId}`, { updatedFields });

		// 6. Update message metadata if assistantMessageId provided
		if (assistantMessageId) {
			try {
				const existingMsg = queries.getMessageById.get([assistantMessageId]) as any;
				let metadata = {};
				if (existingMsg?.metadata) {
					try {
						metadata = JSON.parse(existingMsg.metadata);
					} catch {
						// Fallback to empty if parse fails
					}
				}

				const newMetadata = {
					...metadata,
					profile_updated: true,
					updated_fields: updatedFields,
				};

				queries.updateMessageMetadata.run([JSON.stringify(newMetadata), assistantMessageId]);
				logger.debug(`breathe: updated metadata for message ${assistantMessageId}`, { updatedFields });
			} catch (err) {
				logger.error(`breathe: failed to update message metadata ${assistantMessageId}`, err);
			}
		}

		// Emit live event
		const { emitLiveEvent } = await import('./eventService.js');
		emitLiveEvent(userId, 'profile_updated', { fields: updatedFields });
	} catch (error) {
		logger.error(`breathe failed for user ${userId}`, error);
	}
}

function applyPatches(profile: MedicalProfile, patches: ProfilePatch[]): string[] {
	const updatedFields = new Set<string>();

	for (const patch of patches) {
		if (patch.confidence < PROFILE_MIN_CONFIDENCE) continue;

		const field = patch.field as keyof Omit<MedicalProfile, 'userId' | 'updatedAt'>;
		const currentValue = profile[field];
		const patchValue = patch.value as any;

		if (patch.operation === 'add' && Array.isArray(currentValue)) {
			const newItem = {
				...patchValue,
				id: generateId(),
				source: 'auto',
				confidence: patch.confidence,
				notes: patch.notes,
				recordedAt: patch.recordedAt || now(),
			};
			(profile[field] as any[]) = [...currentValue, newItem];
			updatedFields.add(field);
		} else if (patch.operation === 'update' && Array.isArray(currentValue)) {
			const itemIndex = currentValue.findIndex((item: any) => item.id === patchValue.id);
			if (itemIndex >= 0) {
				const updatedArray = [...currentValue];
				updatedArray[itemIndex] = { ...updatedArray[itemIndex], ...patchValue };
				(profile[field] as any[]) = updatedArray;
				updatedFields.add(field);
			}
		} else if (patch.operation === 'remove' && Array.isArray(currentValue)) {
			(profile[field] as any[]) = currentValue.filter((item: any) => item.id !== patchValue.id);
			updatedFields.add(field);
		} else if (patch.operation === 'add' || patch.operation === 'update') {
			(profile[field] as any) = patchValue;
			updatedFields.add(field);
		}
	}

	return Array.from(updatedFields);
}
