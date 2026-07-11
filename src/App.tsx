import { useState } from 'react';
import { AuthProvider, useAuth } from './lib/authContext';
import { AuthForm } from './components/Auth';
import { SessionList } from './components/SessionList';
import { CreateSession } from './components/CreateSession';
import { GameSession } from './components/GameSession';
import type { Session, SessionPlayer } from './lib/supabase';

type AppView = 'list' | 'create' | 'session';

function AppContent() {
  const { user, loading } = useAuth();
  const [view, setView] = useState<AppView>('list');
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [sessionPlayers, setSessionPlayers] = useState<SessionPlayer[]>([]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 mt-4">Laden...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthForm />;
  }

  const handleSelectSession = (session: Session) => {
    setSelectedSession(session);
    setView('session');
  };

  const handleCreateNew = () => {
    setView('create');
  };

  const handleSessionCreated = (session: Session, players: SessionPlayer[]) => {
    setSelectedSession(session);
    setSessionPlayers(players);
    setView('session');
  };

  const handleBack = () => {
    setView('list');
    setSelectedSession(null);
    setSessionPlayers([]);
  };

  if (view === 'create') {
    return <CreateSession onBack={handleBack} onSessionCreated={handleSessionCreated} />;
  }

  if (view === 'session' && selectedSession) {
    return (
      <GameSession
        session={selectedSession}
        players={sessionPlayers.length > 0 ? sessionPlayers : []}
        onBack={handleBack}
      />
    );
  }

  return (
    <SessionList
      onSelectSession={handleSelectSession}
      onCreateNew={handleCreateNew}
    />
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
