import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { generateId, now, queries } from '../core/db.js';
import { logger } from '../core/logger.js';
import { jsonCompletion } from '../core/openrouterClient.js';
import type { MedicalProfile, ProfileDiff, ProfileHistoryEntry } from '../types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROFILE_MIN_CONFIDENCE = Number.parseFloat(process.env.PROFILE_MIN_CONFIDENCE ?? '0.7');

const ALLOWED_PROFILE_FIELDS = [
	'demographics',
	'currentConditions',
	'persistentConditions',
	'pastConditions',
	'medications',
	'allergies',
	'vitals',
	'labResults',
	'surgeries',
	'familyHistory',
	'lifestyle',
	'freeNotes',
];

// Load profile extractor prompt
const PROFILE_EXTRACTOR_PROMPT = fs.readFileSync(
	path.join(__dirname, '../../../prompts/profile-extractor.txt'),
	'utf-8',
);

// Sub-schemas for medical entities
const ConditionSchema = z.object({
	condition: z.string().describe('Name of the condition (e.g., "Reflux", "Asthma")'),
	name: z.string().nullable().describe('Alias for condition'),
	diagnosedAt: z.string().nullable().describe('ISO date or year of diagnosis'),
	resolvedAt: z.string().nullable().describe('ISO date or year when resolved'),
	severity: z.string().nullable().describe('Severity level (e.g., "mild", "moderate", "severe")'),
	notes: z.string().nullable().describe('Additional notes or details about the condition'),
});

const MedicationSchema = z.object({
	name: z.string().describe('Name of the medication'),
	dosage: z.string().nullable().describe('Dosage (e.g., "500mg")'),
	frequency: z.string().nullable().describe('Frequency (e.g., "once daily", "as needed")'),
	startedAt: z.string().nullable().describe('ISO date or year started'),
	notes: z.string().nullable().describe('Additional notes about the medication'),
});

const AllergySchema = z.object({
	substance: z.string().describe('Substance the user is allergic to'),
	reaction: z.string().nullable().describe('Type of allergic reaction'),
	severity: z.string().nullable().describe('Severity of the allergy'),
	notes: z.string().nullable().describe('Additional context for the allergy'),
});

const VitalReadingSchema = z.object({
	type: z.string().describe('Type of vital (e.g., "Blood Pressure", "Heart Rate", "Weight")'),
	value: z.string().describe('The value recorded'),
	notes: z.string().nullable().describe('Any context for the measurement'),
});

const LabResultSchema = z.object({
	name: z.string().describe('Name of the lab test'),
	value: z.string().describe('The resulting value'),
	unit: z.string().nullable().describe('Unit of measurement'),
	referenceRange: z.string().nullable().describe('Standard reference range'),
	notes: z.string().nullable().describe('Additional notes about the result or its interpretation'),
});

const SurgerySchema = z.object({
	name: z.string().describe('Name of the surgical procedure'),
	date: z.string().nullable().describe('ISO date or year of the surgery'),
	notes: z.string().nullable().describe('Details or complications of the surgery'),
});

const FamilyConditionSchema = z.object({
	relation: z.string().describe('Family member relation (e.g., "Father", "Maternal Grandmother")'),
	condition: z.string().describe('The medical condition they had'),
	notes: z.string().nullable().describe('Notes on severity or age of onset in the family member'),
});

const DemographicsSchema = z.object({
	dateOfBirth: z.string().nullable(),
	sex: z.string().nullable(),
	height: z.string().nullable(),
	weight: z.string().nullable(),
	bloodType: z.string().nullable(),
	notes: z.string().nullable(),
});

const LifestyleSchema = z.object({
	smoking: z.string().nullable(),
	alcohol: z.string().nullable(),
	exercise: z.string().nullable(),
	diet: z.string().nullable(),
	sleep: z.string().nullable(),
	notes: z.string().nullable(),
});

// Zod schema for profile diff validation
export const ProfileDiffSchema = z.object({
	hasNewInfo: z.boolean(),
	patches: z.array(
		z.discriminatedUnion('field', [
			z.object({
				field: z.literal('demographics'),
				operation: z.enum(['update']),
				confidence: z.number().min(0).max(1),
				value: DemographicsSchema,
				notes: z.string(),
				recordedAt: z.string().nullable(),
			}),
			z.object({
				field: z.literal('currentConditions'),
				operation: z.enum(['add', 'update', 'remove']),
				confidence: z.number().min(0).max(1),
				value: ConditionSchema,
				notes: z.string(),
				recordedAt: z.string().nullable(),
			}),
			z.object({
				field: z.literal('persistentConditions'),
				operation: z.enum(['add', 'update', 'remove']),
				confidence: z.number().min(0).max(1),
				value: ConditionSchema,
				notes: z.string(),
				recordedAt: z.string().nullable(),
			}),
			z.object({
				field: z.literal('pastConditions'),
				operation: z.enum(['add', 'update', 'remove']),
				confidence: z.number().min(0).max(1),
				value: ConditionSchema,
				notes: z.string(),
				recordedAt: z.string().nullable(),
			}),
			z.object({
				field: z.literal('medications'),
				operation: z.enum(['add', 'update', 'remove']),
				confidence: z.number().min(0).max(1),
				value: MedicationSchema,
				notes: z.string(),
				recordedAt: z.string().nullable(),
			}),
			z.object({
				field: z.literal('allergies'),
				operation: z.enum(['add', 'update', 'remove']),
				confidence: z.number().min(0).max(1),
				value: AllergySchema,
				notes: z.string(),
				recordedAt: z.string().nullable(),
			}),
			z.object({
				field: z.literal('vitals'),
				operation: z.enum(['add', 'update', 'remove']),
				confidence: z.number().min(0).max(1),
				value: VitalReadingSchema,
				notes: z.string(),
				recordedAt: z.string().nullable(),
			}),
			z.object({
				field: z.literal('labResults'),
				operation: z.enum(['add', 'update', 'remove']),
				confidence: z.number().min(0).max(1),
				value: LabResultSchema,
				notes: z.string(),
				recordedAt: z.string().nullable(),
			}),
			z.object({
				field: z.literal('surgeries'),
				operation: z.enum(['add', 'update', 'remove']),
				confidence: z.number().min(0).max(1),
				value: SurgerySchema,
				notes: z.string(),
				recordedAt: z.string().nullable(),
			}),
			z.object({
				field: z.literal('familyHistory'),
				operation: z.enum(['add', 'update', 'remove']),
				confidence: z.number().min(0).max(1),
				value: FamilyConditionSchema,
				notes: z.string(),
				recordedAt: z.string().nullable(),
			}),
			z.object({
				field: z.literal('lifestyle'),
				operation: z.enum(['update']),
				confidence: z.number().min(0).max(1),
				value: LifestyleSchema,
				notes: z.string(),
				recordedAt: z.string().nullable(),
			}),
			z.object({
				field: z.literal('freeNotes'),
				operation: z.enum(['update']),
				confidence: z.number().min(0).max(1),
				value: z.string(),
				notes: z.string(),
				recordedAt: z.string().nullable(),
			}),
		]),
	),
});


/**
 * Prunes non-standard/ghost fields from the profile object.
 * This is a self-healing mechanism for data corrupted by path-based LLM extraction.
 */
function sanitizeProfile(profile: any): MedicalProfile {
	const sanitized: any = {
		userId: profile.userId,
		updatedAt: profile.updatedAt || now(),
	};

	for (const field of ALLOWED_PROFILE_FIELDS) {
		sanitized[field] = profile[field] || (['lifestyle', 'demographics'].includes(field) ? {} : []);
	}

	return sanitized as MedicalProfile;
}

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

	const rawProfile = JSON.parse(row.profile);
	const sanitized = sanitizeProfile(rawProfile);

	// If sanitization removed fields, persist the clean version
	if (Object.keys(rawProfile).length !== Object.keys(sanitized).length + 2) {
		// +2 for userId and updatedAt which are handled separately in query
		logger.info(`Self-healing: Pruned invalid fields from profile for user ${userId}`);
		queries.updateProfile.run([JSON.stringify(sanitized), sanitized.updatedAt, userId]);
	}

	return sanitized;
}

export function updateProfile(userId: string, updates: Partial<MedicalProfile>): MedicalProfile {
	const current = getProfile(userId);
	if (!current) {
		throw new Error(`Profile not found for user ${userId}`);
	}

	// Filter updates to only allowed fields to prevent injection
	const filteredUpdates: any = {};
	for (const key of Object.keys(updates)) {
		if (ALLOWED_PROFILE_FIELDS.includes(key)) {
			filteredUpdates[key] = (updates as any)[key];
		}
	}

	const updated: MedicalProfile = {
		...current,
		...filteredUpdates,
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
		const patches = diff.patches as any[]; // Type cast for iteration
		const updatedFields = applyPatches(updatedProfile, patches);

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
		emitLiveEvent(userId, 'profile_updated', { fields: updatedFields, messageId: assistantMessageId });
	} catch (error) {
		logger.error(`breathe failed for user ${userId}`, error);
	}
}

function applyPatches(profile: MedicalProfile, patches: ProfileDiff['patches']): string[] {
	const updatedFields = new Set<string>();

	for (const patch of patches) {
		if (patch.confidence < PROFILE_MIN_CONFIDENCE) continue;

		const field = patch.field as keyof Omit<MedicalProfile, 'userId' | 'updatedAt'>;

		// Strict field check
		if (!ALLOWED_PROFILE_FIELDS.includes(field)) {
			logger.warn(`applyPatches: rejected invalid field "${field}"`);
			continue;
		}

		if (processPatch(profile, field, patch)) {
			updatedFields.add(field);
		}
	}

	return Array.from(updatedFields);
}

/**
 * Processes a single patch on the profile.
 * Returns true if the field was updated.
 */
function processPatch(profile: MedicalProfile, field: keyof Omit<MedicalProfile, 'userId' | 'updatedAt'>, patch: ProfileDiff['patches'][0]): boolean {
	const currentValue = profile[field];
	const patchValue = patch.value as any;

	if (Array.isArray(currentValue)) {
		return processArrayPatch(profile, field, currentValue, patch, patchValue);
	}

	// Handle top-level object update (demographics, lifestyle, freeNotes)
	if (patch.operation === 'add' || patch.operation === 'update') {
		(profile[field] as any) = patchValue;
		return true;
	}

	return false;
}

function processArrayPatch(
	profile: MedicalProfile,
	field: keyof Omit<MedicalProfile, 'userId' | 'updatedAt'>,
	currentValue: any[],
	patch: ProfileDiff['patches'][0],
	patchValue: any,
): boolean {
	if (patch.operation === 'add') {
		const newItem = {
			...patchValue,
			id: generateId(),
			source: 'auto',
			confidence: patch.confidence,
			notes: patchValue.notes || patch.notes, // Prefer entity-specific notes if provided
			recordedAt: patch.recordedAt || now(),
		};
		(profile[field] as any[]) = [...currentValue, newItem];
		return true;
	}

	if (patch.operation === 'update') {
		const itemIndex = currentValue.findIndex((item: any) => item.id === patchValue.id);
		if (itemIndex >= 0) {
			const updatedArray = [...currentValue];
			updatedArray[itemIndex] = { ...updatedArray[itemIndex], ...patchValue };
			(profile[field] as any[]) = updatedArray;
			return true;
		}
	}

	if (patch.operation === 'remove') {
		(profile[field] as any[]) = currentValue.filter((item: any) => item.id !== patchValue.id);
		return true;
	}

	return false;
}
