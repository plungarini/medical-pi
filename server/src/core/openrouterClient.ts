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
      `OpenRouter API error [Model: ${OPENROUTER_MODEL}, Schema: ${options.responseFormat?.type === 'json_schema' ? options.responseFormat.json_schema.name : 'none'}]: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }
}

export async function jsonCompletion<T>(
  messages: ChatCompletionMessageParam[],
  schema?: any,
  options: Omit<CompletionOptions, "responseFormat"> & { strict?: boolean } = {}
): Promise<T> {
  const useStrict = options.strict ?? true;

  const getResponseFormatBase = (strict: boolean): ChatCompletionCreateParams["response_format"] => {
    if (schema) {
      return {
        type: "json_schema",
        json_schema: {
          name: "output",
          strict: strict,
          schema
        }
      } as ChatCompletionCreateParams["response_format"];
    }
    return { type: "json_object" } as ChatCompletionCreateParams["response_format"];
  };

  const getMessagesWithSchema = (baseMessages: ChatCompletionMessageParam[]): ChatCompletionMessageParam[] => {
    if (!schema) return baseMessages;
    
    const schemaPrompt = `\n\nCRITICAL: You MUST return a JSON object that adheres strictly to this JSON Schema:\n${JSON.stringify(schema, null, 2)}`;
    
    // Append to the last user message or add as a system message
    const lastMsg = baseMessages[baseMessages.length - 1];
    if (lastMsg && lastMsg.role === 'user') {
      const newMessages = [...baseMessages];
      const currentContent = lastMsg.content;
      
      let newContent: string | Array<any>;
      if (typeof currentContent === 'string') {
        newContent = currentContent + schemaPrompt;
      } else if (Array.isArray(currentContent)) {
        newContent = [...currentContent, { type: 'text', text: schemaPrompt }];
      } else {
        newContent = schemaPrompt;
      }

      newMessages[newMessages.length - 1] = {
        ...lastMsg,
        content: newContent
      } as ChatCompletionMessageParam;
      return newMessages;
    }
    
    return [...baseMessages, { role: 'system', content: `Respond only in JSON matching this schema: ${JSON.stringify(schema)}` }];
  };

  let content: string;
  try {
    content = await completion(messages, {
      ...options,
      responseFormat: getResponseFormatBase(useStrict),
    });
  } catch (error) {
    // If structured output (strict) fails with 400, try falling back to json_object
    if (error instanceof OpenRouterError && (error as any).cause?.status === 400 && schema && useStrict) {
      console.warn(`[OPENROUTER] Structured output (strict: true) failed with 400. Falling back to json_object mode with manual schema injection...`);
      
      const fallbackMessages = getMessagesWithSchema(messages);
      
      content = await completion(fallbackMessages, {
        ...options,
        responseFormat: { type: "json_object" } as ChatCompletionCreateParams["response_format"],
      });
    } else {
      throw error;
    }
  }

  // Sanitization: strip markdown blocks
  if (content.includes("```")) {
    const rx = /```(?:json)?\s*([\s\S]*?)\s*```/;
    const match = rx.exec(content);
    if (match) {
      content = match[1];
    }
  }

  // Sanitization: strip leading/trailing whitespace
  content = content.trim();

  // Sanitization: strip potential trailing junk
  content = content.replaceAll(/\/\/.*/g, ""); // Remove // comments
  content = content.replaceAll(/\/\*[\s\S]*?\*\//g, ""); // Remove /* */ comments

  try {
    return JSON.parse(content) as T;
  } catch (error) {
    throw new OpenRouterError(`Failed to parse JSON response: ${content}`, error);
  }
}

export { client, OPENROUTER_MODEL };
