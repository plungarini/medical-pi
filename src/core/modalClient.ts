import OpenAI from 'openai';
import 'dotenv/config';

const MODAL_ENDPOINT = process.env.MODAL_ENDPOINT;
const MODAL_API_KEY = process.env.MODAL_API_KEY || 'unused';

if (!MODAL_ENDPOINT) {
  throw new Error('MODAL_ENDPOINT environment variable is required');
}

export const modalClient = new OpenAI({
  baseURL: MODAL_ENDPOINT,
  apiKey: MODAL_API_KEY,
  timeout: 120000, // 2 minutes for cold starts
});

export const MODAL_MODEL = 'medgemma-4b-it';

export class ModalError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'ModalError';
  }
}

export interface StreamOptions {
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  tools?: OpenAI.Chat.ChatCompletionTool[];
  temperature?: number;
  max_tokens?: number;
}

export async function* streamCompletion(
  options: StreamOptions,
  retryCount = 0
): AsyncGenerator<OpenAI.Chat.ChatCompletionChunk, void, unknown> {
  const maxRetries = 3;

  try {
    const stream = await modalClient.chat.completions.create({
      model: MODAL_MODEL,
      messages: options.messages,
      tools: options.tools,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 2048,
      stream: true,
    });

    for await (const chunk of stream) {
      yield chunk;
    }
  } catch (error) {
    // Handle cold start / connection timeout with exponential backoff
    if (
      retryCount < maxRetries &&
      (error instanceof Error &&
        (error.message.includes('timeout') ||
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('ETIMEDOUT')))
    ) {
      const delay = Math.pow(2, retryCount) * 1000;
      console.warn(`Modal connection failed, retrying in ${delay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      yield* streamCompletion(options, retryCount + 1);
      return;
    }

    throw new ModalError(
      `Modal streaming failed: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }
}

export async function complete(
  options: Omit<StreamOptions, 'tools'>
): Promise<string> {
  const response = await modalClient.chat.completions.create({
    model: MODAL_MODEL,
    messages: options.messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.max_tokens ?? 2048,
    stream: false,
  });

  return response.choices[0]?.message?.content || '';
}
