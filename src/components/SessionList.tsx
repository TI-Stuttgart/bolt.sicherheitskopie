import { useState, useEffect } from 'react';
import { supabase, type Session } from '../lib/supabase';
import { useAuth } from '../lib/authContext';
import { Plus, Calendar, Users, Clock, Trash2, ChevronRight, Zap, TrendingUp } from 'lucide-react';

interface SessionListProps {
  onSelectSession: (session: Session) => void;
  onCreateNew: () => void;
}

export function SessionList({ onSelectSession, onCreateNew }: SessionListProps) {
  const { user, signOut } = useAuth();
  const [sessions, setSessions] = useState<(Session & { player_names: string[] })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessions();
  }, [user]);

  const loadSessions = async () => {
    if (!user) return;

    const { data: sessionsData } = await supabase
      .from('sessions')
      .select('*')
      .order('created_at', { ascending: false });

    if (sessionsData) {
      const sessionsWithPlayers = await Promise.all(
        sessionsData.map(async (session) => {
          const { data: players } = await supabase
            .from('session_players')
            .select('name')
            .eq('session_id', session.id)
            .order('position');

          return {
            ...session,
            player_names: players?.map(p => p.name) || []
          };
        })
      );
      setSessions(sessionsWithPlayers);
    }
    setLoading(false);
  };

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Session wirklich löschen?')) return;

    const { error } = await supabase.from('sessions').delete().eq('id', id);
    if (error) {
      alert('Fehler beim Löschen: ' + error.message);
      return;
    }
    setSessions(sessions.filter(s => s.id !== id));
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-4xl mx-auto p-4 sm:p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              Skat Abrechnung
            </h1>
            <p className="text-slate-400 mt-1">Willkommen, {user?.email}</p>
          </div>
          <button
            onClick={signOut}
            className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
          >
            Abmelden
          </button>
        </div>

        {/* Create New Button */}
        <button
          onClick={onCreateNew}
          className="w-full mb-6 p-6 bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl text-white font-semibold text-lg hover:from-amber-600 hover:to-orange-600 transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-3"
        >
          <Plus className="w-6 h-6" />
          Neue Session starten
        </button>

        {/* Sessions List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-slate-400 mt-4">Laden...</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12 bg-slate-800/30 rounded-xl border border-slate-700/50">
            <Zap className="w-12 h-12 text-amber-500/50 mx-auto mb-4" />
            <h3 className="text-xl text-white mb-2">Keine Sessions vorhanden</h3>
            <p className="text-slate-400">Starten Sie Ihre erste Skat-Session!</p>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-amber-500" />
              Ihre Sessions
            </h2>
            {sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => onSelectSession(session)}
                className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 sm:p-5 border border-slate-700/50 hover:border-amber-500/50 cursor-pointer transition-all group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-white truncate">
                        {session.name}
                      </h3>
                      {session.is_active && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-green-500/20 text-green-400 rounded-full">
                          Aktiv
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <Users className="w-4 h-4" />
                        {session.player_count} Spieler
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        {formatDate(session.created_at)}
                      </span>
                    </div>
                    <p className="text-slate-500 text-sm mt-2 truncate">
                      {session.player_names.join(' • ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => deleteSession(session.id, e)}
                      className="p-2 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                    <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-amber-500 transition-colors" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
