import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionCreateParams } from "openai/resources/chat/completions";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? "google/gemini-2.0-flash-001";

if (!OPENROUTER_API_KEY) {
  throw new Error("OPENROUTER_API_KEY environment variable is required");
}

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "http://medical.pi",
    "X-Title": "medical-pi",
  },
});

export class OpenRouterError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "OpenRouterError";
  }
}

export interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  responseFormat?: ChatCompletionCreateParams["response_format"];
}

export async function completion(
  messages: ChatCompletionMessageParam[],
  options: CompletionOptions = {}
): Promise<string> {
  try {
    const response = await client.chat.completions.create({
      model: OPENROUTER_MODEL,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      response_format: options.responseFormat,
      stream: false,
    });

    return response.choices[0]?.message?.content ?? "";
  } catch (error) {
    throw new OpenRouterError(
      `OpenRouter API error: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }
}

export async function jsonCompletion<T>(
  messages: ChatCompletionMessageParam[],
  schema?: unknown,
  options: Omit<CompletionOptions, "responseFormat"> = {}
): Promise<T> {
  const content = await completion(messages, {
    ...options,
    responseFormat: schema ? (schema as ChatCompletionCreateParams["response_format"]) : { type: "json_object" },
  });

  try {
    return JSON.parse(content) as T;
  } catch (error) {
    throw new OpenRouterError(`Failed to parse JSON response: ${content}`, error);
  }
}

export { client, OPENROUTER_MODEL };
