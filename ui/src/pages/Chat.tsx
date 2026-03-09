import { useState, useEffect, useRef } from 'react';
import {
  Send,
  Paperclip,
  Menu,
  LogOut,
  Plus,
  User,
  FileText,
  MessageSquare,
} from 'lucide-react';
import { getSessions, createSession, getSession, streamChat } from '../services/api';
import type { Session, Message, SSEEvent } from '../../src/types';
import { MessageBubble } from '../components/MessageBubble';
import { SessionList } from '../components/SessionList';
import { Link } from 'react-router-dom';

interface ChatPageProps {
  onLogout: () => void;
}

export function ChatPage({ onLogout }: ChatPageProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [thinking, setThinking] = useState(false);
  const [currentToolCall, setCurrentToolCall] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadSessions = async () => {
    try {
      const data = await getSessions();
      setSessions(data);
      if (data.length > 0 && !currentSession) {
        selectSession(data[0]);
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  const selectSession = async (session: Session) => {
    setCurrentSession(session);
    try {
      const data = await getSession(session.id);
      setMessages(data.messages);
    } catch (error) {
      console.error('Failed to load session:', error);
    }
  };

  const handleNewSession = async () => {
    try {
      const session = await createSession();
      setSessions([session, ...sessions]);
      setCurrentSession(session);
      setMessages([]);
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  const handleSend = async () => {
    if (!input.trim() && attachments.length === 0) return;
    if (!currentSession) return;

    const userMessage = input;
    setInput('');
    setLoading(true);
    setStreaming(true);
    setThinking(false);
    setCurrentToolCall(null);

    // Optimistically add user message
    const optimisticMessage: Message = {
      id: 'temp-' + Date.now(),
      sessionId: currentSession.id,
      role: 'user',
      content: userMessage,
      attachments: attachments.map((f) => ({
        type: f.type.startsWith('image/') ? 'image' : 'document',
        name: f.name,
        mimeType: f.type,
        url: '',
      })),
      toolCalls: [],
      thinkingContent: '',
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMessage]);

    let assistantContent = '';
    let assistantThinking = '';
    let assistantToolCalls: Message['toolCalls'] = [];

    const cancelStream = streamChat(
      currentSession.id,
      userMessage,
      attachments,
      (event: SSEEvent) => {
        switch (event.event) {
          case 'thinking':
            setThinking(true);
            assistantThinking += event.data.token;
            break;
          case 'tool_call':
            setCurrentToolCall(event.data.name);
            assistantToolCalls.push({
              id: event.data.id,
              name: event.data.name,
              args: event.data.args as Record<string, unknown>,
            });
            break;
          case 'tool_result':
            setCurrentToolCall(null);
            break;
          case 'content':
            setThinking(false);
            assistantContent += event.data.token;
            break;
          case 'done':
            // Refresh messages to get persisted version
            getSession(currentSession.id).then((data) => {
              setMessages(data.messages);
            });
            setAttachments([]);
            setLoading(false);
            setStreaming(false);
            setThinking(false);
            setCurrentToolCall(null);
            break;
          case 'error':
            console.error('Chat error:', event.data.message);
            setLoading(false);
            setStreaming(false);
            setThinking(false);
            setCurrentToolCall(null);
            break;
        }
      },
      (error) => {
        console.error('Stream error:', error);
        setLoading(false);
        setStreaming(false);
        setThinking(false);
        setCurrentToolCall(null);
      },
      () => {
        setStreaming(false);
        setThinking(false);
        setCurrentToolCall(null);
      }
    );

    // Store cancel function if needed
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachments(Array.from(e.target.files));
    }
  };

  return (
    <div className="h-screen flex bg-gray-50">
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? 'w-64' : 'w-0'
        } bg-white border-r border-gray-200 flex flex-col transition-all duration-300 overflow-hidden`}
      >
        <div className="p-4 border-b border-gray-200">
          <button
            onClick={handleNewSession}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>

        <SessionList
          sessions={sessions}
          currentSession={currentSession}
          onSelect={selectSession}
        />

        <div className="p-4 border-t border-gray-200 space-y-1">
          <Link
            to="/profile"
            className="flex items-center gap-3 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <User className="w-4 h-4" />
            Profile
          </Link>
          <Link
            to="/documents"
            className="flex items-center gap-3 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <FileText className="w-4 h-4" />
            Documents
          </Link>
          <Link
            to="/sessions"
            className="flex items-center gap-3 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            All Sessions
          </Link>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <Menu className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="font-semibold text-gray-900">
              {currentSession?.title || 'New Chat'}
            </h1>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center text-gray-400">
              <div className="text-center">
                <p className="text-lg font-medium mb-2">Welcome to Medical AI Assistant</p>
                <p className="text-sm">Start a conversation by typing a message below.</p>
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))
          )}

          {/* Streaming message */}
          {(streaming || thinking) && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-medium">AI</span>
              </div>
              <div className="flex-1 bg-white border border-gray-200 rounded-lg p-3">
                {thinking && (
                  <div className="flex items-center gap-2 text-gray-500 text-sm mb-2">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full thinking-dot" />
                      <div className="w-2 h-2 bg-gray-400 rounded-full thinking-dot" />
                      <div className="w-2 h-2 bg-gray-400 rounded-full thinking-dot" />
                    </div>
                    Thinking...
                  </div>
                )}
                {currentToolCall && (
                  <div className="text-sm text-blue-600 mb-2">
                    Using tool: {currentToolCall}
                  </div>
                )}
                {streaming && !thinking && (
                  <div className="animate-pulse">
                    <div className="h-2 bg-gray-200 rounded w-3/4" />
                  </div>
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="bg-white border-t border-gray-200 p-4">
          {attachments.length > 0 && (
            <div className="flex gap-2 mb-2">
              {attachments.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-1 rounded text-sm"
                >
                  <Paperclip className="w-3 h-3" />
                  {file.name}
                  <button
                    onClick={() => setAttachments(attachments.filter((_, i) => i !== idx))}
                    className="ml-1 hover:text-blue-900"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-3 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Type your message..."
              disabled={loading}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-gray-100"
            />

            <button
              onClick={handleSend}
              disabled={loading || (!input.trim() && attachments.length === 0)}
              className="p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
