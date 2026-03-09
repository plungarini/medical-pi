import { User, Bot } from 'lucide-react';
import type { Message } from '../../src/types';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
          isUser ? 'bg-gray-200' : 'bg-blue-600'
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4 text-gray-600" />
        ) : (
          <Bot className="w-4 h-4 text-white" />
        )}
      </div>

      <div
        className={`max-w-[80%] rounded-lg p-3 ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-white border border-gray-200 text-gray-900'
        }`}
      >
        {message.thinkingContent && (
          <div className="mb-2 p-2 bg-gray-50 rounded text-xs text-gray-500 font-mono border-l-2 border-blue-400">
            <details>
              <summary className="cursor-pointer hover:text-gray-700">Thinking</summary>
              <div className="mt-2 whitespace-pre-wrap">{message.thinkingContent}</div>
            </details>
          </div>
        )}

        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2 space-y-2">
            {message.toolCalls.map((toolCall) => (
              <div
                key={toolCall.id}
                className="p-2 bg-blue-50 rounded text-xs border border-blue-200"
              >
                <div className="font-medium text-blue-700">Tool: {toolCall.name}</div>
                <div className="mt-1 text-gray-600">
                  Args: {JSON.stringify(toolCall.args)}
                </div>
                {toolCall.result && (
                  <div className="mt-1 text-gray-600">
                    Result: {JSON.stringify(toolCall.result).substring(0, 200)}...
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="whitespace-pre-wrap">{message.content}</div>

        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.attachments.map((attachment, idx) => (
              <div
                key={idx}
                className={`text-xs ${isUser ? 'text-blue-100' : 'text-gray-500'}`}
              >
                📎 {attachment.name}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
