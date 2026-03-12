import { logger } from '../core/logger.js';

const MEMORY_PI_ENABLED = process.env.MEMORY_PI_ENABLED === 'true';
const MEMORY_PI_URL = process.env.MEMORY_PI_URL || 'http://127.0.0.1:3002/api';
const MEMORY_PI_PROJECT = process.env.MEMORY_PI_PROJECT || 'health';

/**
 * Save a user prompt to Memory-Pi for semantic storage.
 * This is a fire-and-forget call.
 */
export async function saveMemory(userId: string, sessionId: string, content: string): Promise<void> {
	if (!MEMORY_PI_ENABLED) {
		logger.debug(`[MEMORY] Skipping save: MEMORY_PI_ENABLED is false`);
		return;
	}

	if (!content || content.trim().length === 0) {
		return;
	}

	try {
		logger.info(`[MEMORY] Sending prompt to Memory-Pi for session ${sessionId}`);
		
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

		const response = await fetch(`${MEMORY_PI_URL}/memory`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			signal: controller.signal,
			body: JSON.stringify({
				content: content.trim(),
				metadata: {
					project: MEMORY_PI_PROJECT,
					source: 'medical-pi',
					importance: 0.5,
					tags: ['chat', 'prompt'],
					extra: {
						userId,
						sessionId
					}
				}
			}),
		});

		clearTimeout(timeoutId);

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			
			if (response.status === 422 && errorData.error === 'distillation_no_signal') {
				logger.debug(`[MEMORY] Prompt for session ${sessionId} had no semantic signal. Skipping storage.`);
				return;
			}

			logger.warn(`[MEMORY] Failed to save to Memory-Pi: ${response.status}`, errorData);
			return;
		}

		logger.info(`[MEMORY] Successfully saved prompt to Memory-Pi for session ${sessionId}`);
	} catch (error) {
		// Silently ignore errors (e.g. server offline, timeout)
		logger.warn(`[MEMORY] Memory-Pi connection failed or timed out. Skipping semantic storage.`);
	}
}
