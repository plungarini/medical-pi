import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/Login';
import { ChatPage } from './pages/Chat';
import { ProfilePage } from './pages/Profile';
import { DocumentsPage } from './pages/Documents';
import { SessionsPage } from './pages/Sessions';
import { getToken, isAuthenticated, logout } from './services/auth';

function App() {
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const checkAuth = async () => {
      const auth = await isAuthenticated();
      setAuthenticated(auth);
      setLoading(false);
    };
    checkAuth();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            authenticated ? (
              <Navigate to="/chat" replace />
            ) : (
              <LoginPage onLogin={() => setAuthenticated(true)} />
            )
          }
        />
        <Route
          path="/chat"
          element={
            authenticated ? (
              <ChatPage onLogout={() => { logout(); setAuthenticated(false); }} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/profile"
          element={
            authenticated ? (
              <ProfilePage onLogout={() => { logout(); setAuthenticated(false); }} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/documents"
          element={
            authenticated ? (
              <DocumentsPage onLogout={() => { logout(); setAuthenticated(false); }} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/sessions"
          element={
            authenticated ? (
              <SessionsPage onLogout={() => { logout(); setAuthenticated(false); }} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route path="/" element={<Navigate to="/chat" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
