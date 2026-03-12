import OpenAI from 'openai';
import { logger } from './logger.js';

const MODAL_ENDPOINT = process.env.MODAL_ENDPOINT;
const MODAL_API_KEY = process.env.MODAL_API_KEY ?? 'unused';
export const MODAL_MODEL = process.env.MODAL_MODEL ?? 'medgemma-1.5-4b-it';

if (!MODAL_ENDPOINT) {
	throw new Error('MODAL_ENDPOINT environment variable is required');
}

/**
 * Native OpenAI client configured for Modal.com custom endpoint
 */
export const client = new OpenAI({
	baseURL: `${MODAL_ENDPOINT}/v1`,
	apiKey: MODAL_API_KEY,
	timeout: 5 * 60 * 1000, // 5 min
	maxRetries: 3,
});

export class ModalError extends Error {
	constructor(
		message: string,
		public readonly cause?: unknown,
	) {
		super(message);
		this.name = 'ModalError';
	}
}

export interface StreamChunk {
	type: 'thinking' | 'content' | 'tool_call';
	token?: string;
	toolCall?: {
		id: string;
		name: string;
		args: string;
	};
}

// Extend the Delta type to include reasoning
interface ExtendedDelta extends OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta {
	reasoning?: string;
}

/**
 * Stream chat completion from Modal API
 * Used for non-SDK streaming scenarios
 */
export async function* streamChat(
	messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
	tools?: OpenAI.Chat.Completions.ChatCompletionTool[],
	options: { maxRetries?: number } = {},
): AsyncGenerator<StreamChunk> {
	const maxRetries = options.maxRetries ?? 3;
	let attempt = 0;

	while (attempt < maxRetries) {
		try {
			logger.info(`[MODAL] Attempt ${attempt + 1}/${maxRetries}: Sending ${messages.length} messages`);

			logger.info(`[MODAL] Messages list`, messages);

			const stream = await client.chat.completions.create({
				model: MODAL_MODEL,
				messages,
				tools,
				stream: true,
				temperature: 0.7,
			});

			let isThinking = false;
			let currentToolCall: { id: string; name: string; args: string } | null = null;
			let chunkCount = 0;

			for await (const chunk of stream) {
				chunkCount++;
				const delta = chunk.choices[0]?.delta as ExtendedDelta;

				if (delta?.content) {
					let content = delta.content;

					// Handle MedGemma reasoning tags
					if (content.includes('<unused94>')) {
						isThinking = true;
						content = content.replace('<unused94>', '');
					}

					const endThoughtIndex = content.indexOf('<unused95>');
					if (endThoughtIndex !== -1) {
						const thoughtPart = content.slice(0, endThoughtIndex);
						if (thoughtPart) yield { type: 'thinking', token: thoughtPart };
						isThinking = false;
						content = content.slice(endThoughtIndex + '<unused95>'.length);
					}

					if (content) {
						yield { type: isThinking ? 'thinking' : 'content', token: content };
					}
				}

				if (delta?.reasoning) {
					yield { type: 'thinking', token: delta.reasoning };
				}

				// Handle tool calls
				if (delta?.tool_calls) {
					for (const toolCall of delta.tool_calls) {
						if (toolCall.id) {
							if (currentToolCall) {
								yield { type: 'tool_call', toolCall: { ...currentToolCall } };
							}
							currentToolCall = {
								id: toolCall.id,
								name: toolCall.function?.name ?? '',
								args: toolCall.function?.arguments ?? '',
							};
						} else if (currentToolCall) {
							if (toolCall.function?.name) currentToolCall.name += toolCall.function.name;
							if (toolCall.function?.arguments) currentToolCall.args += toolCall.function.arguments;
						}
					}
				}

				if (chunk.choices[0]?.finish_reason) {
					if (currentToolCall) {
						yield { type: 'tool_call', toolCall: { ...currentToolCall } };
					}
					logger.info(`[MODAL] Stream completed after ${chunkCount} chunks`);
					break;
				}
			}

			return;
		} catch (error) {
			attempt++;
			const errorMessage = error instanceof Error ? error.message : String(error);

			const isRetryable =
				error instanceof Error &&
				(errorMessage.includes('timeout') ||
					errorMessage.includes('ETIMEDOUT') ||
					errorMessage.includes('ECONNREFUSED') ||
					errorMessage.includes('ECONNRESET') ||
					errorMessage.includes('fetch failed'));

			logger.warn(`[MODAL] Attempt ${attempt}/${maxRetries} failed: ${errorMessage}`);

			if (!isRetryable || attempt >= maxRetries) {
				throw new ModalError(`Modal API error after ${attempt} attempts: ${errorMessage}`, error);
			}

			const delay = Math.pow(2, attempt - 1) * 1000 + Math.random() * 200;
			logger.info(`[MODAL] Retrying in ${Math.round(delay)}ms...`);
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}
}

export async function chatCompletion(
	messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
	tools?: OpenAI.Chat.Completions.ChatCompletionTool[],
): Promise<{
	content: string;
	thinkingContent: string;
	toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
}> {
	const response = await client.chat.completions.create({
		model: MODAL_MODEL,
		messages,
		tools,
		stream: false,
		temperature: 0.7,
	});

	const message = response.choices[0]?.message;
	const toolCalls =
		message?.tool_calls?.map((tc) => ({
			id: tc.id,
			name: tc.function.name,
			args: JSON.parse(tc.function.arguments) as Record<string, unknown>,
		})) ?? [];

	return {
		content: message?.content ?? '',
		thinkingContent: (message as unknown as { reasoning?: string })?.reasoning ?? '',
		toolCalls,
	};
}
