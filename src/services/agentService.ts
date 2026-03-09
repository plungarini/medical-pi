import { streamCompletion, MODAL_MODEL } from '../core/modalClient.js';
import type { Message, Attachment, SSEEvent, ToolCall } from '../types/index.js';
import { getRecentMessages, createMessage } from './chatService.js';
import { getProfile } from './profileService.js';
import { searchSessions } from './searchService.js';
import { getSession } from './chatService.js';
import { searchDocuments, indexMessages } from './searchService.js';
import { getDocument } from './documentService.js';
import type OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MEMORY_PI_ENABLED = process.env.MEMORY_PI_ENABLED === 'true';
const MEMORY_PI_URL = process.env.MEMORY_PI_URL || 'http://127.0.0.1:3002/api';
const BRAVE_SEARCH_API_KEY = process.env.BRAVE_SEARCH_API_KEY;

// Tool definitions
const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_sessions',
      description: 'Search through past chat sessions for relevant information',
      parameters: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Search query' },
          limit: { type: 'number', description: 'Maximum number of results', default: 5 },
        },
        required: ['q'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_session',
      description: 'Get full details of a specific session including all messages',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'The session ID' },
        },
        required: ['sessionId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_medical_profile',
      description: 'Get the user medical profile. Use fields parameter to request specific sections.',
      parameters: {
        type: 'object',
        properties: {
          fields: {
            type: 'array',
            items: { type: 'string' },
            description: 'Specific profile fields to retrieve (e.g., ["medications", "allergies"])',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_documents',
      description: 'Search through uploaded medical documents',
      parameters: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Search query' },
          limit: { type: 'number', description: 'Maximum number of results', default: 5 },
        },
        required: ['q'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_document',
      description: 'Get the full content of a specific medical document',
      parameters: {
        type: 'object',
        properties: {
          documentId: { type: 'string', description: 'The document ID' },
        },
        required: ['documentId'],
      },
    },
  },
];

// Add web_search if Brave API key is configured
if (BRAVE_SEARCH_API_KEY) {
  tools.push({
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for current medical information',
      parameters: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Search query' },
        },
        required: ['q'],
      },
    },
  });
}

// Add memory_pi_search if enabled
if (MEMORY_PI_ENABLED) {
  tools.push({
    type: 'function',
    function: {
      name: 'memory_pi_search',
      description: 'Search through semantic memory for related information',
      parameters: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Search query' },
        },
        required: ['q'],
      },
    },
  });
}

interface ToolResult {
  id: string;
  name: string;
  result: unknown;
}

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  userId: string
): Promise<unknown> {
  switch (name) {
    case 'search_sessions': {
      const result = await searchSessions(userId, args.q as string, (args.limit as number) || 5);
      return result;
    }
    case 'get_session': {
      const session = getSession(userId, args.sessionId as string);
      return session;
    }
    case 'get_medical_profile': {
      const profile = getProfile(userId);
      if (args.fields && Array.isArray(args.fields)) {
        const filtered: Record<string, unknown> = { userId: profile.userId };
        for (const field of args.fields) {
          if (field in profile) {
            filtered[field] = profile[field as keyof typeof profile];
          }
        }
        return filtered;
      }
      return profile;
    }
    case 'search_documents': {
      const result = await searchDocuments(userId, args.q as string, (args.limit as number) || 5);
      return result;
    }
    case 'get_document': {
      const doc = getDocument(userId, args.documentId as string);
      return doc;
    }
    case 'web_search': {
      if (!BRAVE_SEARCH_API_KEY) return { error: 'Web search not configured' };
      const response = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(args.q as string)}&count=5`,
        {
          headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': BRAVE_SEARCH_API_KEY,
          },
        }
      );
      const data = await response.json();
      return {
        results: (data.web?.results || []).map((r: { title: string; url: string; description: string }) => ({
          title: r.title,
          url: r.url,
          snippet: r.description,
        })),
      };
    }
    case 'memory_pi_search': {
      if (!MEMORY_PI_ENABLED) return { error: 'Memory pi not enabled' };
      const response = await fetch(`${MEMORY_PI_URL}/search?q=${encodeURIComponent(args.q as string)}`);
      return await response.json();
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

export async function* runAgent(
  sessionId: string,
  userId: string,
  userMessage: string,
  attachments: Attachment[]
): AsyncGenerator<SSEEvent, { messageId: string; content: string; thinkingContent: string }, unknown> {
  // Load system prompt
  let systemPrompt: string;
  try {
    systemPrompt = fs.readFileSync(path.join(__dirname, '../../prompts/system.txt'), 'utf-8');
  } catch {
    systemPrompt =
      'You are a helpful medical AI assistant. Use available tools to retrieve relevant information. Medical Profile: {MEDICAL_PROFILE_JSON}';
  }

  // Load context
  const recentMessages = getRecentMessages(sessionId, 20);
  const profile = getProfile(userId);

  // Inject profile into system prompt
  systemPrompt = systemPrompt.replace('{MEDICAL_PROFILE_JSON}', JSON.stringify(profile, null, 2));

  // Build messages array
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...recentMessages.map((m): OpenAI.Chat.ChatCompletionMessageParam => {
      if (m.role === 'user') {
        return {
          role: 'user',
          content: m.attachments?.length
            ? [
                { type: 'text', text: m.content },
                ...m.attachments.map((a) => ({
                  type: 'image_url' as const,
                  image_url: { url: `data:${a.mimeType};base64,${a.url}` },
                })),
              ]
            : m.content,
        };
      }
      if (m.role === 'assistant') {
        return { role: 'assistant', content: m.content };
      }
      return { role: 'system', content: m.content };
    }),
    {
      role: 'user',
      content: attachments.length
        ? [
            { type: 'text', text: userMessage },
            ...attachments.map((a) => ({
              type: 'image_url' as const,
              image_url: { url: `data:${a.mimeType};base64,${a.url}` },
            })),
          ]
        : userMessage,
    },
  ];

  let assistantContent = '';
  let thinkingContent = '';
  let toolCalls: ToolCall[] = [];
  let pendingToolCalls: Map<
    number,
    { id: string; name: string; args: string }
  > = new Map();
  let messageId = '';

  // Agent loop
  while (true) {
    const stream = streamCompletion({
      messages,
      tools,
      temperature: 0.7,
      max_tokens: 2048,
    });

    assistantContent = '';
    thinkingContent = '';
    pendingToolCalls.clear();

    try {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        // Handle thinking tokens (if model supports it)
        if ((delta as { thinking?: string })?.thinking) {
          const token = (delta as { thinking?: string }).thinking || '';
          thinkingContent += token;
          yield { event: 'thinking', data: { token } };
          continue;
        }

        // Handle content
        if (delta?.content) {
          const token = delta.content;
          assistantContent += token;
          yield { event: 'content', data: { token } };
        }

        // Handle tool calls
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const index = tc.index || 0;
            const existing = pendingToolCalls.get(index);

            if (tc.id) {
              if (existing) {
                existing.id = tc.id;
              } else {
                pendingToolCalls.set(index, { id: tc.id, name: tc.function?.name || '', args: '' });
              }
            }

            if (tc.function?.arguments) {
              if (existing) {
                existing.args += tc.function.arguments;
              } else {
                pendingToolCalls.set(index, { id: tc.id || '', name: tc.function?.name || '', args: tc.function.arguments });
              }
            }

            if (tc.function?.name && existing) {
              existing.name = tc.function.name;
            }
          }
        }
      }
    } catch (error) {
      console.error('Streaming error:', error);
      yield { event: 'error', data: { message: error instanceof Error ? error.message : 'Streaming failed' } };
      throw error;
    }

    // Process tool calls
    if (pendingToolCalls.size > 0) {
      const toolResults: ToolResult[] = [];

      for (const [_, toolCall] of pendingToolCalls) {
        if (!toolCall.name || !toolCall.id) continue;

        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(toolCall.args);
        } catch {
          // Invalid JSON args
        }

        yield { event: 'tool_call', data: { id: toolCall.id, name: toolCall.name, args } };

        const result = await executeTool(toolCall.name, args, userId);

        yield { event: 'tool_result', data: { id: toolCall.id, name: toolCall.name, result } };

        toolResults.push({ id: toolCall.id, name: toolCall.name, result });

        toolCalls.push({
          id: toolCall.id,
          name: toolCall.name,
          args,
          result,
        });
      }

      // Add assistant message with tool calls
      messages.push({
        role: 'assistant',
        content: assistantContent,
        tool_calls: Array.from(pendingToolCalls.values()).map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.args },
        })),
      });

      // Add tool results
      for (const tr of toolResults) {
        messages.push({
          role: 'tool',
          tool_call_id: tr.id,
          content: JSON.stringify(tr.result),
        });
      }

      // Continue the loop for another inference
      continue;
    }

    // No tool calls, we're done
    break;
  }

  // Persist messages
  const userMsg = createMessage(sessionId, 'user', userMessage, attachments);
  const assistantMsg = createMessage(sessionId, 'assistant', assistantContent, [], toolCalls, thinkingContent);
  messageId = assistantMsg.id;

  // Index messages asynchronously
  const session = getSession(userId, sessionId);
  if (session) {
    indexMessages([userMsg, assistantMsg], session.title, userId).catch(console.error);
  }

  return { messageId, content: assistantContent, thinkingContent };
}
