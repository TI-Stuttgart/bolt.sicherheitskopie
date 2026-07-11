import { useState } from 'react';
import { useAuth } from '../lib/authContext';
import { supabase, type Session, type SessionPlayer } from '../lib/supabase';
import { ArrowLeft, Users } from 'lucide-react';

interface CreateSessionProps {
  onBack: () => void;
  onSessionCreated: (session: Session, players: SessionPlayer[]) => void;
}

export function CreateSession({ onBack, onSessionCreated }: CreateSessionProps) {
  const { user } = useAuth();
  const [playerCount, setPlayerCount] = useState(4);
  const [playerNames, setPlayerNames] = useState<string[]>(['', '', '', '']);
  const [sessionName, setSessionName] = useState(
    new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  );
  const [centPerPoint, setCentPerPoint] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePlayerCountChange = (count: number) => {
    setPlayerCount(count);
    const newNames = [...playerNames];
    while (newNames.length < count) newNames.push('');
    while (newNames.length > count) newNames.pop();
    setPlayerNames(newNames.slice(0, count));
  };

  const updatePlayerName = (index: number, name: string) => {
    const newNames = [...playerNames];
    newNames[index] = name;
    setPlayerNames(newNames);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validate all names are filled
    if (centPerPoint === '' || centPerPoint < 1) {
      setError('Bitte Cent pro Punkt eingeben');
      setLoading(false);
      return;
    }

    if (playerNames.some(name => name.trim() === '')) {
      setError('Bitte alle Spielernamen eingeben');
      setLoading(false);
      return;
    }

    // Check for duplicate names
    const uniqueNames = new Set(playerNames.map(n => n.trim().toLowerCase()));
    if (uniqueNames.size !== playerNames.length) {
      setError('Spielernamen müssen eindeutig sein');
      setLoading(false);
      return;
    }

    try {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      const baseName = sessionName.trim() ||
        now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const uniqueName = `${baseName} ${timeStr}`;

      // Create session
      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .insert({
          user_id: user!.id,
          name: uniqueName,
          player_count: playerCount,
          cent_per_point: typeof centPerPoint === 'number' ? centPerPoint : 1,
          current_dealer_index: 0,
          sitter_index: 0,
          current_game_number: 0,
          total_bock_games: 0,
          is_active: true,
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      // Create players
      const playersToInsert = playerNames.map((name, index) => ({
        session_id: sessionData.id,
        name: name.trim(),
        position: index,
        total_score: 0,
      }));

      const { data: playersData, error: playersError } = await supabase
        .from('session_players')
        .insert(playersToInsert)
        .select();

      if (playersError) throw playersError;

      onSessionCreated(sessionData, playersData);
    } catch (err) {
      setError('Fehler beim Erstellen der Session');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Zurück
        </button>

        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 sm:p-8 border border-slate-700/50">
          <h1 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
            <Users className="w-7 h-7 text-amber-500" />
            Neue Session
          </h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Session Name */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Session-Name
              </label>
              <input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                placeholder="z.B. Freitagsskat"
              />
            </div>

            {/* Player Count */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">
                Anzahl Spieler
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[3, 4, 5].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => handlePlayerCountChange(count)}
                    className={`py-3 rounded-lg font-semibold transition-all ${
                      playerCount === count
                        ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                        : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {count} Spieler
                  </button>
                ))}
              </div>
            </div>

            {/* Player Names */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">
                Spielernamen (in Sitzreihenfolge)
              </label>
              <div className="space-y-3">
                {playerNames.map((name, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-400 font-medium text-sm">
                      {index + 1}
                    </div>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => updatePlayerName(index, e.target.value)}
                      className="flex-1 px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                      placeholder={`Spieler ${index + 1}`}
                    />
                  </div>
                ))}
              </div>
              {playerCount === 4 && (
                <p className="text-slate-500 text-sm mt-2">
                  Tipp: Bei 4 Spielern sitzt der Geber immer aus
                </p>
              )}
              {playerCount === 5 && (
                <p className="text-slate-500 text-sm mt-2">
                  Tipp: Bei 5 Spielern sitzt der Geber und der 4. Spieler (vom Geber aus gezählt)
                </p>
              )}
            </div>

            {/* Cent per Point */}
            <div>
              <input
                type="number"
                value={centPerPoint}
                onChange={(e) => {
                  const v = e.target.value;
                  setCentPerPoint(v === '' ? '' : Math.max(1, parseInt(v) || 1));
                }}
                className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                placeholder="ct/punkt"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-lg hover:from-amber-600 hover:to-orange-600 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-amber-500/20"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Erstellen...
                </span>
              ) : (
                'Session starten'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
