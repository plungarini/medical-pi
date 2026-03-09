import { useState, useEffect } from 'react';
import { ArrowLeft, LogOut, MessageSquare, Plus, Pin, Trash2, Search } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { getSessions, createSession, deleteSession, updateSession } from '../services/api';
import type { Session } from '../../src/types';

interface SessionsPageProps {
  onLogout: () => void;
}

export function SessionsPage({ onLogout }: SessionsPageProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const data = await getSessions(1, 100);
      setSessions(data);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNewSession = async () => {
    try {
      const session = await createSession();
      navigate('/chat');
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this session?')) return;

    try {
      await deleteSession(id);
      setSessions(sessions.filter((s) => s.id !== id));
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  const handlePin = async (session: Session) => {
    try {
      await updateSession(session.id, { pinned: !session.pinned });
      setSessions(
        sessions.map((s) =>
          s.id === session.id ? { ...s, pinned: !s.pinned } : s
        )
      );
    } catch (error) {
      console.error('Failed to pin session:', error);
    }
  };

  const filteredSessions = sessions.filter(
    (s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pinnedSessions = filteredSessions.filter((s) => s.pinned);
  const unpinnedSessions = filteredSessions.filter((s) => !s.pinned);

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/chat" className="p-2 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <h1 className="text-xl font-semibold text-gray-900">All Sessions</h1>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto p-4">
        {/* Search and New */}
        <div className="flex gap-3 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sessions..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
          <button
            onClick={handleNewSession}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Session
          </button>
        </div>

        {/* Sessions List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>No sessions found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pinnedSessions.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-gray-500 mb-2 px-1">Pinned</h2>
                <div className="space-y-2">
                  {pinnedSessions.map((session) => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      onPin={() => handlePin(session)}
                      onDelete={() => handleDelete(session.id)}
                      formatDate={formatDate}
                    />
                  ))}
                </div>
              </div>
            )}

            {unpinnedSessions.length > 0 && (
              <div>
                {pinnedSessions.length > 0 && (
                  <h2 className="text-sm font-medium text-gray-500 mb-2 px-1">Recent</h2>
                )}
                <div className="space-y-2">
                  {unpinnedSessions.map((session) => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      onPin={() => handlePin(session)}
                      onDelete={() => handleDelete(session.id)}
                      formatDate={formatDate}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

interface SessionCardProps {
  session: Session;
  onPin: () => void;
  onDelete: () => void;
  formatDate: (date: string) => string;
}

function SessionCard({ session, onPin, onDelete, formatDate }: SessionCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between hover:shadow-md transition-shadow">
      <Link to={`/chat?session=${session.id}`} className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <MessageSquare className="w-5 h-5 text-blue-600" />
          </div>
          <div className="min-w-0">
            <h3 className="font-medium text-gray-900 truncate">
              {session.title || 'Untitled Session'}
            </h3>
            <p className="text-sm text-gray-500">
              {session.messageCount} messages • {formatDate(session.updatedAt)}
            </p>
          </div>
        </div>
      </Link>

      <div className="flex items-center gap-1 ml-4">
        <button
          onClick={onPin}
          className={`p-2 rounded-lg transition-colors ${
            session.pinned
              ? 'text-blue-600 bg-blue-50'
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
          }`}
          title={session.pinned ? 'Unpin' : 'Pin'}
        >
          <Pin className={`w-4 h-4 ${session.pinned ? 'fill-current' : ''}`} />
        </button>
        <button
          onClick={onDelete}
          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
