import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { runAgent } from '../../services/agentService.js';
import { breathe } from '../../services/profileService.js';
import type { SSEEvent, Attachment } from '../../types/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_DOCUMENT_SIZE_MB = parseInt(process.env.MAX_DOCUMENT_SIZE_MB || '25', 10);
const MAX_DOCUMENT_SIZE = MAX_DOCUMENT_SIZE_MB * 1024 * 1024;

interface ChatParams {
  sessionId: string;
}

export async function chatRoutes(fastify: FastifyInstance): Promise<void> {
  const authenticate = (fastify as unknown as { authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void> }).authenticate;

  // POST /api/chat/:sessionId
  fastify.post<{ Params: ChatParams }>(
    '/:sessionId',
    {
      onRequest: [authenticate],
      preHandler: async (request: FastifyRequest) => {
        // Handle multipart form data
        const contentType = request.headers['content-type'] || '';
        if (contentType.includes('multipart/form-data')) {
          // Fastify multipart is handled by @fastify/multipart plugin
        }
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = (request as unknown as { user: { userId: string } }).user;
      const { sessionId } = request.params as ChatParams;

      // Parse multipart data
      const parts = request.parts?.();
      let message = '';
      const attachments: Attachment[] = [];

      if (parts) {
        for await (const part of parts) {
          if (part.type === 'file') {
            // Handle file upload
            const buffer = await part.toBuffer();

            if (buffer.length > MAX_DOCUMENT_SIZE) {
              return reply.code(413).send({
                error: `File too large. Maximum size is ${MAX_DOCUMENT_SIZE_MB}MB`,
              });
            }

            // Save file and create attachment
            const attachment: Attachment = {
              type: part.mimetype.startsWith('image/')
                ? 'image'
                : part.mimetype.startsWith('audio/')
                  ? 'audio'
                  : 'document',
              name: part.filename,
              mimeType: part.mimetype,
              url: buffer.toString('base64'),
            };
            attachments.push(attachment);
          } else {
            // Handle field
            const value = await part.value;
            if (part.fieldname === 'message') {
              message = value;
            }
          }
        }
      } else {
        // JSON body fallback
        const body = request.body as { message?: string };
        message = body.message || '';
      }

      if (!message.trim() && attachments.length === 0) {
        return reply.code(400).send({ error: 'Message or attachment required' });
      }

      // Set up SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      const sendEvent = (event: SSEEvent) => {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      try {
        const generator = runAgent(sessionId, user.userId, message, attachments);

        let result: IteratorResult<SSEEvent, { messageId: string; content: string; thinkingContent: string }>;
        let assistantContent = '';
        let thinkingContent = '';
        let messageId = '';

        while (true) {
          result = await generator.next();

          if (result.done) {
            assistantContent = result.value.content;
            thinkingContent = result.value.thinkingContent;
            messageId = result.value.messageId;
            break;
          }

          sendEvent(result.value);
        }

        // Send done event
        sendEvent({ event: 'done', data: { messageId, sessionId } });

        // Fire-and-forget profile breathing
        breathe(user.userId, message, assistantContent)
          .then((update) => {
            if (update) {
              sendEvent({ event: 'profile_updated', data: update });
            }
          })
          .catch(console.error);

        reply.raw.end();
      } catch (error) {
        console.error('Chat error:', error);
        sendEvent({
          event: 'error',
          data: { message: error instanceof Error ? error.message : 'Chat failed' },
        });
        reply.raw.end();
      }
    }
  );
}
