import { MessageSquare, Pin } from 'lucide-react';
import type { Session } from '../../src/types';

interface SessionListProps {
  sessions: Session[];
  currentSession: Session | null;
  onSelect: (session: Session) => void;
}

export function SessionList({ sessions, currentSession, onSelect }: SessionListProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'long' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const pinnedSessions = sessions.filter((s) => s.pinned);
  const unpinnedSessions = sessions.filter((s) => !s.pinned);

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-1">
      {pinnedSessions.length > 0 && (
        <div className="mb-2">
          <div className="px-3 py-1 text-xs font-medium text-gray-500">Pinned</div>
          {pinnedSessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              isActive={currentSession?.id === session.id}
              onClick={() => onSelect(session)}
              formatDate={formatDate}
            />
          ))}
        </div>
      )}

      {unpinnedSessions.length > 0 && (
        <div>
          {pinnedSessions.length > 0 && (
            <div className="px-3 py-1 text-xs font-medium text-gray-500">Recent</div>
          )}
          {unpinnedSessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              isActive={currentSession?.id === session.id}
              onClick={() => onSelect(session)}
              formatDate={formatDate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface SessionItemProps {
  session: Session;
  isActive: boolean;
  onClick: () => void;
  formatDate: (date: string) => string;
}

function SessionItem({ session, isActive, onClick, formatDate }: SessionItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
        isActive
          ? 'bg-blue-50 text-blue-900'
          : 'text-gray-700 hover:bg-gray-100'
      }`}
    >
      <MessageSquare className="w-4 h-4 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {session.title || 'Untitled Session'}
        </div>
        <div className="text-xs text-gray-500">
          {session.messageCount} messages • {formatDate(session.updatedAt)}
        </div>
      </div>
      {session.pinned && <Pin className="w-3 h-3 text-blue-500 fill-current" />}
    </button>
  );
}
