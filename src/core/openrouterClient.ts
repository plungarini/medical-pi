import OpenAI from 'openai';
import 'dotenv/config';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001';

if (!OPENROUTER_API_KEY) {
  throw new Error('OPENROUTER_API_KEY environment variable is required');
}

export const openrouterClient = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'http://medical.pi',
    'X-Title': 'medical-pi',
  },
  timeout: 60000,
});

export async function complete(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  options: {
    temperature?: number;
    max_tokens?: number;
    response_format?: { type: 'json_object' | 'json_schema'; json_schema?: unknown };
  } = {}
): Promise<string> {
  const response = await openrouterClient.chat.completions.create({
    model: OPENROUTER_MODEL,
    messages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.max_tokens ?? 1024,
    response_format: options.response_format,
    stream: false,
  });

  return response.choices[0]?.message?.content || '';
}

export async function completeJson<T>(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  schema: { name: string; schema: unknown },
  options: { temperature?: number; max_tokens?: number } = {}
): Promise<T> {
  const response = await openrouterClient.chat.completions.create({
    model: OPENROUTER_MODEL,
    messages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.max_tokens ?? 1024,
    response_format: {
      type: 'json_schema',
      json_schema: schema,
    },
    stream: false,
  });

  const content = response.choices[0]?.message?.content || '{}';
  return JSON.parse(content) as T;
}
