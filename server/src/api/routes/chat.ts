import { createOpenAI } from '@ai-sdk/openai';
import { consumeStream, createUIMessageStreamResponse, streamText, TextStreamPart, UIMessageChunk } from 'ai';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../../core/logger.js';
import { createMessage, getRecentMessages } from '../../services/chatService.js';
import { getProfile, breathe } from '../../services/profileService.js';
import { createSession } from '../../services/sessionService.js';
import { generateAndSave } from '../../services/titleService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, '../../../../prompts/system.txt'), 'utf-8');
const CONTEXT_LIMIT = Number.parseInt(process.env.CONTEXT_MESSAGE_LIMIT ?? '20', 10);

const MODAL_ENDPOINT = process.env.MODAL_ENDPOINT;
const MODAL_API_KEY = process.env.MODAL_API_KEY ?? 'unused';
const MODAL_MODEL = process.env.MODAL_MODEL ?? 'medgemma-1.5-4b-it';

if (!MODAL_ENDPOINT) {
	throw new Error('MODAL_ENDPOINT environment variable is required');
}

// Create AI SDK-compatible client for Modal API
const openai = createOpenAI({
	baseURL: `${MODAL_ENDPOINT}/v1`,
	apiKey: MODAL_API_KEY,
});

// Message types from frontend
interface TextPart {
	type: 'text';
	text: string;
}

interface FrontendMessage {
	role: 'user' | 'assistant' | 'system' | 'tool';
	content?: string;
	parts?: TextPart[];
}

/**
 * Extract text content from the last user message
 */
function extractUserMessage(messages: FrontendMessage[]): string {
	const lastUser = [...messages].reverse().find((m) => m.role === 'user');
	if (!lastUser) return '';

	// Handle parts array (Vercel AI SDK format)
	if (Array.isArray(lastUser.parts)) {
		return lastUser.parts
			.filter((p) => p.type === 'text')
			.map((p) => p.text)
			.join('');
	}

	// Handle string content
	if (typeof lastUser.content === 'string') return lastUser.content;

	return '';
}

/**
 * Build messages array for AI SDK including chat history
 * Ensures alternating roles (User/Assistant/User...)
 */
function buildMessages(
	sessionId: string,
	userMessage: string,
	systemPrompt: string,
): Array<{ role: 'user' | 'assistant'; content: string }> {
	const history = getRecentMessages(sessionId, CONTEXT_LIMIT);
	const rawMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

	// 1. Gather historical messages (filter out tool/system)
	// This already includes the message we just persisted.
	for (const msg of history) {
		if (msg.role === 'user' || msg.role === 'assistant') {
			rawMessages.push({
				role: msg.role as 'user' | 'assistant',
				content: msg.content || '',
			});
		}
	}

	// 2. Normalize: Merge consecutive messages with the same role
	const normalized: Array<{ role: 'user' | 'assistant'; content: string }> = [];
	for (const msg of rawMessages) {
		const last = normalized[normalized.length - 1];
		if (last && last.role === msg.role) {
			last.content += `\n\n${msg.content}`;
		} else {
			normalized.push({ ...msg });
		}
	}

	// 4. Ensure it starts with 'user' for MedGemma compatibility
	while (normalized.length > 0 && normalized[0].role !== 'user') {
		normalized.shift();
	}

	// 5. Inject system prompt into the FIRST user message
	if (normalized.length > 0 && normalized[0].role === 'user') {
		const firstContent = normalized[0].content;
		normalized[0].content = `${systemPrompt}\n\n----\n\nThe user asked: ${firstContent}`;
	}

	return normalized;
}

/**
 * Convert Response headers to a simple object
 */
function responseHeadersToObject(response: Response): Record<string, string> {
	const headers: Record<string, string> = {};
	response.headers.forEach((value, key) => {
		headers[key] = value;
	});
	return headers;
}

export default async function chatRoutes(fastify: FastifyInstance) {
	logger.info('[CHAT] Route Registration - CODE_VERSION: 1.0.6-DEFINITIVE');
	// Unified endpoint for Vercel AI SDK useChat
	fastify.post('/', async (request, reply) => {
		logger.info('[CHAT] Request received - CODE_VERSION: 1.0.9-FINAL');
		if (!request.user) {
			reply.status(401).send({ error: 'Unauthorized' });
			return;
		}

		// Determine session ID
		let sessionId = request.headers['x-session-id'] as string;

		if (!sessionId) {
			try {
				const session = createSession(request.user.userId);
				sessionId = session.id;
				logger.info(`[CHAT] Created new session ${sessionId} on the fly`);
			} catch (error) {
				logger.error('[CHAT] Failed to create session', error);
				reply.status(500).send({ error: 'Failed to create session' });
				return;
			}
		}

		const body = request.body as { messages: FrontendMessage[] };
		if (!body?.messages || body.messages.length === 0) {
			reply.status(400).send({ error: 'No messages found' });
			return;
		}

		const userMessage = extractUserMessage(body.messages);
		if (!userMessage) {
			reply.status(400).send({ error: 'No user message content found' });
			return;
		}

		// Persist user message
		try {
			createMessage({
				sessionId: sessionId,
				role: 'user',
				content: userMessage,
				attachments: [],
			});
			logger.info(`[CHAT] Persisted user message for session ${sessionId}`);
		} catch (error) {
			logger.error('[CHAT] Failed to persist user message', error);
		}

		// Build system prompt with profile
		const profile = getProfile(request.user.userId);
		const systemPrompt = SYSTEM_PROMPT.replace('{MEDICAL_PROFILE_JSON}', JSON.stringify(profile, null, 2));
		logger.info(`[CHAT] System Prompt (first 100 chars): ${systemPrompt.slice(0, 100)}...`);

		// Build context array
		const messages = buildMessages(sessionId, userMessage, systemPrompt);

		try {
			logger.info(`[CHAT] Starting streamText for session ${sessionId}`);
			logger.info(`[CHAT] Modal BaseURL: ${MODAL_ENDPOINT}/v1`);
			logger.info(`[CHAT] Modal Model: ${MODAL_MODEL}`);

			// Setup LLM stream
			const result = streamText({
				model: openai.chat(MODAL_MODEL),
				messages: messages,
				temperature: 0.7,
				maxRetries: 3,
			});

			// Split the stream: one for UI, one for background persistence
			const [uiStream, persistStream] = result.fullStream.tee();

			// 1. Persistence Stream (Background)
			consumeStream({
				stream: persistStream.pipeThrough(
					new TransformStream<any, any>({
						async transform(part, controller) {
							controller.enqueue(part);

							if (part.type === 'finish') {
								try {
									const fullText = await result.text;
									const assistantMsg = createMessage({
										sessionId: sessionId,
										role: 'assistant',
										content: fullText,
									});
									logger.info(`[CHAT] Persisted assistant message ${assistantMsg.id} for session ${sessionId}`);

									// 3. Fire-and-forget: Breathing Profile
									void breathe(request.user!.userId, userMessage, fullText, assistantMsg.id).catch((err) =>
										logger.error(`[CHAT] breathe failed for ${sessionId}`, err),
									);

									// 4. Fire-and-forget: Title Generation (on first exchange)
									const { prepare } = await import('../../core/db.js');
									const row = prepare('SELECT message_count FROM sessions WHERE id = ?').get(sessionId) as any;
									if (row && row.message_count <= 2) {
										void generateAndSave(sessionId).catch((err) =>
											logger.error(`[CHAT] title generation failed for ${sessionId}`, err),
										);
									}
								} catch (err) {
									logger.error(`[CHAT] Failed to persist AI message for ${sessionId}`, err);
								}
							}
						},
					}),
				),
			}).catch((err) => {
				logger.error(`[CHAT] Error in persistence stream for ${sessionId}`, err);
			});

			// 2. UI Stream (Transformed)
			let isThinking = false;
			let hasStartedTextPart = false;
			let hasSeenReasoningContent = false;
			let buffer = '';
			const transformedStream = uiStream.pipeThrough(
				new TransformStream<TextStreamPart<any>, UIMessageChunk>({
					transform(part, controller) {
						const partId = (part as any).id || `msg-${Date.now()}`;

						if (part.type === 'text-delta') {
							buffer += (part as any).text || '';
							const unused94 = '<unused94>';
							const unused95 = '<unused95>';

							while (true) {
								if (!isThinking) {
									const tagIndex = buffer.indexOf(unused94);
									if (tagIndex !== -1) {
										// Emit text before tag (if any)
										if (tagIndex > 0) {
											if (!hasStartedTextPart) {
												controller.enqueue({ type: 'text-start', id: partId } as any);
												hasStartedTextPart = true;
											}
											controller.enqueue({
												type: 'text-delta',
												id: partId,
												delta: buffer.slice(0, tagIndex),
											});
										}
										// Start reasoning
										isThinking = true;
										hasSeenReasoningContent = false;
										controller.enqueue({
											type: 'reasoning-start',
											id: `reasoning-${partId}`,
										});
										buffer = buffer.slice(tagIndex + unused94.length);
										continue;
									}
								} else {
									const tagIndex = buffer.indexOf(unused95);
									if (tagIndex !== -1) {
										// Emit reasoning before tag
										if (tagIndex > 0) {
											let chunkContent = buffer.slice(0, tagIndex);
											if (!hasSeenReasoningContent) {
												chunkContent = chunkContent.replace(/^thought\s*/i, '').trimStart();
											}
											if (chunkContent) {
												controller.enqueue({
													type: 'reasoning-delta',
													id: `reasoning-${partId}`,
													delta: chunkContent,
												});
											}
										}
										// End reasoning
										isThinking = false;
										controller.enqueue({
											type: 'reasoning-end',
											id: `reasoning-${partId}`,
										});
										buffer = buffer.slice(tagIndex + unused95.length);
										continue;
									}
								}

								// Buffer protection for tags
								const targetTag = isThinking ? unused95 : unused94;
								let safeLength = buffer.length;
								for (let i = 1; i < targetTag.length; i++) {
									if (buffer.endsWith(targetTag.slice(0, i))) {
										safeLength = buffer.length - i;
										break;
									}
								}

								if (isThinking && !hasSeenReasoningContent) {
									// Buffer at least 20 chars to safely check for "thought " prefix
									if (safeLength < 20 && buffer.indexOf(unused95) === -1) {
										break;
									}

									let reasoningContent = buffer.slice(0, safeLength);
									buffer = buffer.slice(safeLength);

									// Strip prefix and trim using regex
									reasoningContent = reasoningContent.replace(/^thought\s*/i, '').trimStart();

									if (reasoningContent) {
										hasSeenReasoningContent = true;
										controller.enqueue({
											type: 'reasoning-delta',
											id: `reasoning-${partId}`,
											delta: reasoningContent,
										});
									}
								} else if (safeLength > 0) {
									const chunkContent = buffer.slice(0, safeLength);
									buffer = buffer.slice(safeLength);

									if (!isThinking) {
										if (!hasStartedTextPart) {
											controller.enqueue({ type: 'text-start', id: partId } as any);
											hasStartedTextPart = true;
										}
										controller.enqueue({ type: 'text-delta', id: partId, delta: chunkContent });
									} else {
										hasSeenReasoningContent = true;
										controller.enqueue({
											type: 'reasoning-delta',
											id: `reasoning-${partId}`,
											delta: chunkContent,
										});
									}
								}
								break;
							}
						} else if (part.type === 'text-start') {
							// We skip the initial text-start from the model because we might start with reasoning.
							// We'll emit our own text-start only when we have real text.
						} else if (part.type === 'text-end') {
							if (hasStartedTextPart) {
								controller.enqueue({ type: 'text-end', id: partId } as any);
							}
						} else if (part.type === 'reasoning-start') {
							controller.enqueue({ type: 'reasoning-start', id: partId } as any);
						} else if (part.type === 'reasoning-delta') {
							controller.enqueue({
								type: 'reasoning-delta',
								id: partId,
								delta: (part as any).delta || '',
							} as any);
						} else if (part.type === 'reasoning-end') {
							controller.enqueue({ type: 'reasoning-end', id: partId } as any);
						} else if (part.type === 'tool-call') {
							controller.enqueue({
								type: 'tool-call',
								toolCallId: (part as any).toolCallId,
								toolName: (part as any).toolName,
								args: (part as any).args || (part as any).input,
							} as any);
						} else if (part.type === 'tool-result') {
							controller.enqueue({
								type: 'tool-result',
								toolCallId: (part as any).toolCallId,
								toolName: (part as any).toolName,
								result: (part as any).result || (part as any).output,
							} as any);
						} else if (part.type === 'finish') {
							controller.enqueue({
								type: 'finish',
								finishReason: (part as any).finishReason,
							} as any);
						} else if (part.type === 'error') {
							controller.enqueue({
								type: 'error',
								errorText: (part as any).errorText || (part.error as any)?.message || String(part.error),
							} as any);
						}
					},
				}),
			);

			// Use the utility to create the SSE response
			const uiStreamResponse = createUIMessageStreamResponse({
				stream: transformedStream,
			});

			const headers = responseHeadersToObject(uiStreamResponse);
			Object.entries(headers).forEach(([key, value]) => {
				reply.header(key, value);
			});

			reply.header('X-Session-Id', sessionId);

			return reply.send(uiStreamResponse.body as ReadableStream<Uint8Array>);
		} catch (error: any) {
			logger.error('[CHAT] Stream connection error', error);

			let errorMessage = 'An error occurred while communicating with the AI model.';

			// Attempt to extract detailed error from AI SDK/Modal response
			if (error.responseBody) {
				try {
					const parsed = typeof error.responseBody === 'string' ? JSON.parse(error.responseBody) : error.responseBody;
					if (parsed.message) {
						errorMessage = parsed.message;
					}
				} catch (e) {
					logger.warn('[CHAT] Failed to parse error response body', e);
				}
			} else if (error.message) {
				errorMessage = error.message;
			}

			// 3) Persistance on session chat works if reloading the page.
			try {
				createMessage({
					sessionId: sessionId,
					role: 'assistant',
					content: `Error: ${errorMessage}`,
				});
				logger.info(`[CHAT] Persisted error message for session ${sessionId}`);
			} catch (persistErr) {
				logger.error('[CHAT] Failed to persist error message', persistErr);
			}

			// Return 200 with a stream that sends the error message as a text chunk
			// This makes it appear as an assistant response in the UI
			const errorStream = new ReadableStream({
				start(controller) {
					const encoder = new TextEncoder();
					const chunk = {
						type: 'text-delta',
						id: `error-${Date.now()}`,
						delta: `Error: ${errorMessage}`,
					};
					// Encode as SSE manually or use createUIMessageStreamResponse
					controller.enqueue(chunk);
					controller.enqueue({ type: 'finish', id: chunk.id, finishReason: 'error' });
					controller.close();
				},
			});

			const errorResponse = createUIMessageStreamResponse({
				stream: errorStream as any,
			});

			const headers = responseHeadersToObject(errorResponse);
			Object.entries(headers).forEach(([key, value]) => {
				reply.header(key, value);
			});

			return reply.send(errorResponse.body as ReadableStream<Uint8Array>);
		}
	});
}
