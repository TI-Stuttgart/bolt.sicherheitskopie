import { useState, useEffect, useCallback } from 'react';
import { supabase, type Session, type SessionPlayer, type Game, type QueueItem } from '../lib/supabase';
import {
  calculateBaseGameValue,
  calculateFinalGameValue,
  isNullGame,
  isRamschGame,
  needsBuben,
  triggersBockRound,
  isGrandHand,
  getGamesPerRound,
  SUIT_VALUES,
  NULL_VALUES,
} from '../lib/skatLogic';
import {
  ArrowLeft,
  Plus,
  Minus,
  Trophy,
  XCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  RotateCcw,
  Zap,
  Target,
  Crown,
  Flame,
  ArrowRight,
} from 'lucide-react';
import type { GameType } from '../lib/supabase';

interface GameSessionProps {
  session: Session;
  players: SessionPlayer[];
  onBack: () => void;
}

type GameResult = 'won' | 'lost' | '';

export function GameSession({ session, players: initialPlayers, onBack }: GameSessionProps) {
  const [players, setPlayers] = useState<SessionPlayer[]>(initialPlayers);
  const [games, setGames] = useState<(Game & {
    opponents?: { player_id: string; role: string }[];
    scores?: { player_id: string; score_change: number }[];
  })[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Game input state
  const [showGameForm, setShowGameForm] = useState(false);
  const [gameType, setGameType] = useState<GameType | ''>('');
  const [gameResult, setGameResult] = useState<GameResult>('');
  const [soloistId, setSoloistId] = useState<string>('');
  const [bubenCount, setBubenCount] = useState<number | null>(null);
  const [bubenWith, setBubenWith] = useState<boolean | null>(null);
  const [hand, setHand] = useState(false);
  const [schneider, setSchneider] = useState(false);
  const [schneiderAnnounced, setSchneiderAnnounced] = useState(false);
  const [schwarz, setSchwarz] = useState(false);
  const [schwarzAnnounced, setSchwarzAnnounced] = useState(false);
  const [ouvert, setOuvert] = useState(false);
  const [kontra, setKontra] = useState(false);
  const [re, setRe] = useState(false);
  const [isBock, setIsBock] = useState(false);
  const [isTischramsch, setIsTischramsch] = useState(false);

  // Ramsch specific
  const [ramschSchieben, setRamschSchieben] = useState(0);
  const [ramschJungfrau, setRamschJungfrau] = useState(false);
  const [ramschPlayerPoints, setRamschPlayerPoints] = useState<Record<string, number>>({});
  const [ramschSkatPoints, setRamschSkatPoints] = useState(0);

  const [saving, setSaving] = useState(false);
  const [showAbrechnung, setShowAbrechnung] = useState(false);

  // Derived states
  const [currentDealer, setCurrentDealer] = useState<SessionPlayer | null>(null);
  const [activePlayers, setActivePlayers] = useState<SessionPlayer[]>([]);

  const loadGameData = useCallback(async () => {
    setLoading(true);

    // Always load players to ensure we have fresh data
    const { data: playersData } = await supabase
      .from('session_players')
      .select('*')
      .eq('session_id', session.id)
      .order('position');
    if (playersData && playersData.length > 0) {
      setPlayers(playersData);
    }

    // Load games
    const { data: gamesData } = await supabase
      .from('games')
      .select('*')
      .eq('session_id', session.id)
      .order('game_number');

    // Load opponents and scores for all games in batch
    if (gamesData && gamesData.length > 0) {
      const gameIds = gamesData.map(g => g.id);
      const [{ data: allOpponents }, { data: allScores }] = await Promise.all([
        supabase.from('game_opponents').select('game_id, player_id, role').in('game_id', gameIds),
        supabase.from('game_scores').select('game_id, player_id, score_change').in('game_id', gameIds),
      ]);
      const gamesWithData = gamesData.map(game => ({
        ...game,
        opponents: (allOpponents || []).filter(o => o.game_id === game.id),
        scores: (allScores || []).filter(s => s.game_id === game.id),
      }));
      setGames(gamesWithData);
    } else {
      setGames([]);
    }

    // Load queue
    const { data: queueData } = await supabase
      .from('queue_items')
      .select('*')
      .eq('session_id', session.id)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true });

    setQueue(queueData || []);

    // Update local session state
    const { data: updatedSession } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', session.id)
      .single();

    if (updatedSession) {
      Object.assign(session, updatedSession);
    }

    setLoading(false);
  }, [session.id, players.length]);

  useEffect(() => {
    loadGameData();
  }, [loadGameData]);

  // Calculate current dealer and active players
  useEffect(() => {
    const dealer = players[session.current_dealer_index] || players[0];
    setCurrentDealer(dealer);

    // Calculate who is sitting out
    const active = players.filter((p) => {
      if (session.player_count === 3) return true;
      if (session.player_count === 4) return p.id !== dealer.id;
      if (session.player_count === 5) {
        const dealerIdx = players.findIndex((pl) => pl.id === dealer.id);
        const fourthFromDealerIdx = (dealerIdx + 4) % 5;
        return p.id !== dealer.id && p.id !== players[fourthFromDealerIdx].id;
      }
      return true;
    });
    setActivePlayers(active);
  }, [players, session.current_dealer_index, session.player_count]);

  // Get active queue item
  const activeQueueItem = queue.find((item) => item.games_remaining > 0);

  // Determine if current game is in Bock/Ramsch
  const getCurrentGameState = () => {
    if (session.current_game_number === 0) {
      return { isBockRound: false, isRamschRound: false, gamesRemaining: 0 };
    }

    if (activeQueueItem?.type === 'bock') {
      return { isBockRound: true, isRamschRound: false, gamesRemaining: activeQueueItem.games_remaining };
    }
    if (activeQueueItem?.type === 'ramsch') {
      return { isBockRound: false, isRamschRound: true, gamesRemaining: activeQueueItem.games_remaining };
    }
    return { isBockRound: false, isRamschRound: false, gamesRemaining: 0 };
  };

  const gameState = getCurrentGameState();

  // Calculate preview value
  const calculatePreview = (): { value: number; display: string } => {
    if (!gameType) return { value: 0, display: 'Bitte Spieltyp wählen' };
    const gt: GameType = gameType;

    // Tischramsch - only record points, NO inter-player settlement
    if (gt === 'tischramsch') {
      const pts = activePlayers.map(p => ramschPlayerPoints[p.id] ?? 0);
      const total = pts.reduce((s, v) => s + v, 0) + ramschSkatPoints;
      if (total !== 120) {
        return { value: 0, display: `${total}/120` };
      }
      const maxPts = Math.max(...pts, 0);
      const losers = activePlayers.filter(p => (ramschPlayerPoints[p.id] ?? 0) === maxPts);

      if (losers.length === 0 || maxPts === 0) {
        return { value: 0, display: 'Kein Verlierer' };
      }

      let mult = 2;
      if (ramschJungfrau) mult *= 2;
      const paymentPerLoser = maxPts * mult;

      return { value: paymentPerLoser, display: `${paymentPerLoser}` };
    }

    if (isRamschGame(gt)) {
      const pts = activePlayers.map(p => ramschPlayerPoints[p.id] ?? 0);
      const total = pts.reduce((s, v) => s + v, 0) + ramschSkatPoints;
      if (total !== 120) {
        return { value: 0, display: `${total}/120` };
      }
      const maxPts = Math.max(...pts);
      const losers = activePlayers.filter(p => (ramschPlayerPoints[p.id] ?? 0) === maxPts);
      const winners = activePlayers.filter(p => (ramschPlayerPoints[p.id] ?? 0) < maxPts);
      const singleLoser = losers.length === 1 ? losers[0] : null;
      const isDM = !!singleLoser && maxPts + ramschSkatPoints === 120 && winners.length === 0;
      let loserBase = isDM ? 120 : singleLoser ? maxPts + ramschSkatPoints : maxPts;
      let mult = 1;
      for (let i = 0; i < ramschSchieben; i++) mult *= 2;
      if (ramschJungfrau) mult *= 2;
      if (gameState.isBockRound || isBock) mult *= 2;
      const finalVal = loserBase * mult;
      if (isDM) {
        return { value: finalVal, display: `Durchmarsch ${singleLoser!.name}` };
      }
      const loserNames = losers.map(p => p.name).join(' & ');
      return { value: finalVal, display: loserNames };
    }

    if (isNullGame(gt)) {
      let value = NULL_VALUES[gt] || 0;
      const grandHandBock = isGrandHand(gt, hand) && !isBock && !gameState.isBockRound;
      if (kontra) value *= 2;
      if (re) value *= 2;
      if (gameState.isBockRound || isBock || grandHandBock) value *= 2;
      if (gameResult === 'lost' && (kontra || re || isBock || gameState.isBockRound || grandHandBock)) value *= 2;
      const labels: Record<string, string> = {
        null: 'Null', null_hand: 'Null Hand', null_ouvert: 'Null Ouvert',
        null_ouvert_hand: 'Null Ouvert Hand', revolution: 'Revolution',
      };
      const sign = gameResult === 'lost' ? '-' : '';
      return { value, display: `${labels[gt] || gt}: ${sign}${value}` };
    }

    if (!bubenCount || bubenWith === null) {
      return { value: 0, display: 'Bitte mit/ohne wählen' };
    }

    // Suit games and Grand
    const baseValue = calculateBaseGameValue(
      gt,
      bubenCount,
      bubenWith,
      hand,
      schneider,
      schneiderAnnounced,
      schwarz,
      schwarzAnnounced
    );

    const grandHandBock = isGrandHand(gt, hand) && !isBock && !gameState.isBockRound;

    const finalValue = calculateFinalGameValue(
      baseValue,
      kontra,
      re,
      isBock || gameState.isBockRound || grandHandBock
    );

    const baseStages = (bubenCount ?? 0) + 1;
    const suitValue = SUIT_VALUES[gt] || 0;
    const mitOffneText = bubenWith ? `mit${bubenCount}` : `ohne${4 - bubenCount!}`;
    let displayText = `${mitOffneText} spielt ${baseStages}`;
    let runningStages = baseStages;
    if (hand) { runningStages++; displayText += `, hand ${runningStages}`; }
    if (schneider) { runningStages++; displayText += `, Schneider ${runningStages}`; }
    if (schneiderAnnounced) { runningStages++; displayText += `, Schneider anges. ${runningStages}`; }
    if (schwarz) { runningStages++; displayText += `, Schwarz ${runningStages}`; }
    if (schwarzAnnounced) { runningStages++; displayText += `, Schwarz anges. ${runningStages}`; }
    displayText += ` × ${suitValue} = ${baseValue}`;
    let runningValue = baseValue;
    const isBockDoubled = isBock || gameState.isBockRound || grandHandBock;
    if (isBockDoubled) { runningValue *= 2; displayText += ` Bock ${runningValue}`; }
    if (kontra) { runningValue *= 2; displayText += ` Kontra ${runningValue}`; }
    if (re) { runningValue *= 2; displayText += ` Re ${runningValue}`; }
    return {
      value: finalValue,
      display: displayText,
    };
  };

  const preview = calculatePreview();

  // Handle game submission
  const handleSubmitGame = async () => {
    if (!gameType) return;
    const gt: GameType = gameType;
    setSaving(true);

    try {
      const gameNumber = session.current_game_number + 1;
      const isBockRound = gameState.isBockRound;
      const isRamschRound = gameState.isRamschRound;

      const grandHandBock = isGrandHand(gt, hand) && !isBock && !isBockRound;
      const gameIsBock = isBockRound || isBock || grandHandBock;
      const isGrandHandDuringRamsch = isGrandHand(gt, hand) && isRamschRound;

      let calculatedValue = preview.value;
      let ramschIsDM = false;
      let ramschLoserIdComputed: string | null = null;
      const scoreChanges: { player_id: string; change: number }[] = [];

      // Tischramsch - only record points, NO inter-player settlement
      if (gt === 'tischramsch') {
        const pts = activePlayers.map(p => ramschPlayerPoints[p.id] ?? 0);
        const maxPts = Math.max(...pts, 0);
        const losers = activePlayers.filter(p => (ramschPlayerPoints[p.id] ?? 0) === maxPts);

        let mult = 2;
        if (ramschJungfrau) mult *= 2;
        const paymentPerLoser = maxPts * mult;
        calculatedValue = paymentPerLoser;
        ramschLoserIdComputed = losers.length === 1 ? losers[0].id : null;

        losers.forEach(l => scoreChanges.push({ player_id: l.id, change: -paymentPerLoser }));

      } else if (isRamschGame(gt)) {
        const pts = activePlayers.map(p => ramschPlayerPoints[p.id] ?? 0);
        const maxPts = Math.max(...pts, 0);
        const losers = activePlayers.filter(p => (ramschPlayerPoints[p.id] ?? 0) === maxPts);
        const winners = activePlayers.filter(p => (ramschPlayerPoints[p.id] ?? 0) < maxPts);
        const singleLoser = losers.length === 1 ? losers[0] : null;
        ramschIsDM = !!singleLoser && maxPts + ramschSkatPoints === 120 && winners.length === 0;
        let loserBase = ramschIsDM ? 120 : singleLoser ? maxPts + ramschSkatPoints : maxPts;
        let mult = 1;
        for (let i = 0; i < ramschSchieben; i++) mult *= 2;
        if (ramschJungfrau) mult *= 2;
        if (gameIsBock) mult *= 2;
        const finalVal = loserBase * mult;
        calculatedValue = finalVal;
        ramschLoserIdComputed = singleLoser?.id ?? null;

        if (ramschIsDM) {
          scoreChanges.push({ player_id: singleLoser!.id, change: finalVal * winners.length });
          winners.forEach(p => scoreChanges.push({ player_id: p.id, change: -finalVal }));
        } else {
          losers.forEach(l => scoreChanges.push({ player_id: l.id, change: -finalVal * winners.length }));
          winners.forEach(w => scoreChanges.push({ player_id: w.id, change: finalVal * losers.length }));
        }
      } else {
        if (soloistId) {
          const soloistScore = gameResult === 'won' ? calculatedValue : -calculatedValue;
          scoreChanges.push({ player_id: soloistId, change: soloistScore });
        }
      }

      const newGame: Partial<Game> = {
        session_id: session.id,
        game_number: gameNumber,
        dealer_id: currentDealer?.id,
        soloist_id: isRamschGame(gt) ? (ramschIsDM ? ramschLoserIdComputed : null) : soloistId,
        game_type: gt,
        won: gameResult === 'won' || isRamschGame(gt),
        buben_count: needsBuben(gt) ? bubenCount : null,
        buben_with: needsBuben(gt) ? bubenWith : null,
        hand,
        schneider,
        schneider_announced: schneiderAnnounced,
        schwarz,
        schwarz_announced: schwarzAnnounced,
        ouvert,
        kontra,
        re,
        is_bock: gameIsBock,
        is_ramsch: (isRamschRound && !isGrandHandDuringRamsch) || isRamschGame(gt),
        calculated_value: calculatedValue,
        ramsch_schieben_count: isRamschGame(gt) ? ramschSchieben : 0,
        ramsch_jungfrau: isRamschGame(gt) ? ramschJungfrau : false,
        ramsch_durchmarsch: ramschIsDM,
        ramsch_loser_id: ramschLoserIdComputed,
        lost_doubling_count: gameResult === 'lost' ? (kontra ? 1 : 0) + (re ? 1 : 0) + (gameIsBock ? 1 : 0) : 0,
      };

      const { data: insertedGame, error: gameError } = await supabase
        .from('games')
        .insert(newGame)
        .select()
        .single();

      if (gameError) throw gameError;

      await supabase.from('game_scores').insert(
        scoreChanges.map(sc => ({
          game_id: insertedGame.id,
          player_id: sc.player_id,
          score_change: Math.round(sc.change),
        }))
      );

      if (soloistId && !isRamschGame(gt)) {
        await supabase.from('game_opponents').insert([
          { game_id: insertedGame.id, player_id: soloistId, role: 'soloist' },
          ...activePlayers.filter(p => p.id !== soloistId).map(p => ({
            game_id: insertedGame.id,
            player_id: p.id,
            role: 'opponent' as const,
          })),
          ...players.filter(p => !activePlayers.includes(p)).map(p => ({
            game_id: insertedGame.id,
            player_id: p.id,
            role: 'sitter' as const,
          })),
        ]);
      }

      for (const sc of scoreChanges) {
        const player = players.find(p => p.id === sc.player_id);
        if (player) {
          await supabase
            .from('session_players')
            .update({ total_score: player.total_score + Math.round(sc.change) })
            .eq('id', player.id);
        }
      }

      const nextDealerIndex = isGrandHandDuringRamsch
        ? session.current_dealer_index
        : (session.current_dealer_index + 1) % session.player_count;
      let newBockCount = session.total_bock_games;

      if (activeQueueItem && !isGrandHandDuringRamsch) {
        await supabase
          .from('queue_items')
          .update({ games_remaining: activeQueueItem.games_remaining - 1 })
          .eq('id', activeQueueItem.id);

        if (activeQueueItem.games_remaining <= 1) {
          await supabase.from('queue_items').delete().eq('id', activeQueueItem.id);
        }

        if (activeQueueItem.type === 'bock') {
          newBockCount += 1;
        }
      }

      if (grandHandBock) {
        newBockCount += 1;
      }

      if (!isRamschGame(gt)) {
        const baseValue = needsBuben(gt)
          ? calculateBaseGameValue(gt, bubenCount, bubenWith, hand, schneider, schneiderAnnounced, schwarz, schwarzAnnounced)
          : NULL_VALUES[gt] || 0;

        if (triggersBockRound(gt, baseValue, gameResult === 'won', hand, kontra, re)) {
          const gamesForNewRound = grandHandBock
            ? getGamesPerRound(session.player_count) - 1
            : getGamesPerRound(session.player_count);

          if (gamesForNewRound > 0) {
            await supabase.from('queue_items').insert({
              session_id: session.id,
              type: 'bock',
              games_remaining: gamesForNewRound,
              priority: 0,
            });
          }
        }

        {
          const ramschThreshold = 2 * getGamesPerRound(session.player_count);
          if (newBockCount >= ramschThreshold && session.total_bock_games < ramschThreshold) {
            await supabase.from('queue_items').insert({
              session_id: session.id,
              type: 'ramsch',
              games_remaining: getGamesPerRound(session.player_count),
              priority: 0,
            });
          }
        }
      }

      // Update session
      await supabase
        .from('sessions')
        .update({
          current_dealer_index: nextDealerIndex,
          current_game_number: gameNumber,
          total_bock_games: newBockCount,
        })
        .eq('id', session.id);

      // Reset form
      resetForm();
      loadGameData();
    } catch (err) {
      console.error('Error saving game:', err);
    }

    setSaving(false);
  };

  const resetForm = () => {
    setGameType('');
    setGameResult('');
    setSoloistId('');
    setBubenCount(null);
    setBubenWith(null);
    setHand(false);
    setSchneider(false);
    setSchneiderAnnounced(false);
    setSchwarz(false);
    setSchwarzAnnounced(false);
    setOuvert(false);
    setKontra(false);
    setRe(false);
    setIsBock(false);
    setIsTischramsch(false);
    setRamschSchieben(0);
    setRamschJungfrau(false);
    setRamschPlayerPoints({});
    setRamschSkatPoints(0);
    setShowGameForm(false);
  };

  // Handle Spaltarsch (60 points rule)
  const handleSpaltarsch = async () => {
    const newQueue = [...queue];
    // Add Ramsch and Bock at front of queue
    await supabase.from('queue_items').insert([
      { session_id: session.id, type: 'ramsch', games_remaining: getGamesPerRound(session.player_count), priority: 999 },
      { session_id: session.id, type: 'bock', games_remaining: getGamesPerRound(session.player_count), priority: 999 },
    ]);
    loadGameData();
  };

  // Game type options
  const gameTypeOptions: { value: GameType; label: string; group: string }[] = [
    { value: 'kreuz', label: 'Kreuz', group: 'Farbspiel' },
    { value: 'pik', label: 'Pik', group: 'Farbspiel' },
    { value: 'herz', label: 'Herz', group: 'Farbspiel' },
    { value: 'karo', label: 'Karo', group: 'Farbspiel' },
    { value: 'grand', label: 'Grand', group: 'Farbspiel' },
    { value: 'null', label: 'Null', group: 'Nullspiel' },
    { value: 'null_hand', label: 'Null Hand', group: 'Nullspiel' },
    { value: 'null_ouvert', label: 'Null Ouvert', group: 'Nullspiel' },
    { value: 'null_ouvert_hand', label: 'Null Ouvert Hand', group: 'Nullspiel' },
    { value: 'revolution', label: 'Revolution', group: 'Nullspiel' },
    { value: 'ramsch', label: 'Ramsch', group: 'Ramsch' },
    { value: 'tischramsch', label: 'Tischramsch', group: 'Ramsch' },
  ];

  // Reload players
  const reloadPlayers = async () => {
    const { data } = await supabase
      .from('session_players')
      .select('*')
      .eq('session_id', session.id)
      .order('position');
    if (data) {
      players.length = 0;
      players.push(...data);
    }
  };

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white mb-2 transition-colors">
              <ArrowLeft className="w-5 h-5" />
              Zurück
            </button>
            <h1 className="text-2xl font-bold text-white">{session.name}</h1>
            <p className="text-slate-400">
              Spiel {session.current_game_number + 1} | {session.cent_per_point} Ct/Punkt
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => loadGameData()}
              className="p-2 text-slate-400 hover:text-white transition-colors"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Queue Status Banner */}
        <QueueBanner
          queue={queue}
          gameNumber={session.current_game_number}
          totalBockGames={session.total_bock_games}
          playerCount={session.player_count}
          onSpaltarsch={handleSpaltarsch}
        />

        {/* Combined Skat-Zettel: Spieltisch + Spielliste */}
        <SkatZettelTable
          games={games}
          players={players}
          currentDealer={currentDealer}
          activePlayers={activePlayers}
          playerCount={session.player_count}
        />

        {/* Add Game Button */}
        {!showGameForm && (
          <button
            onClick={() => setShowGameForm(true)}
            className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 text-lg"
          >
            <Plus className="w-6 h-6" />
            Spiel {session.current_game_number + 1} eintragen
          </button>
        )}

        {/* Game Input Form */}
        {showGameForm && (
          <GameInputForm
            gameType={gameType}
            setGameType={setGameType}
            gameResult={gameResult}
            setGameResult={setGameResult}
            soloistId={soloistId}
            setSoloistId={setSoloistId}
            bubenCount={bubenCount}
            setBubenCount={setBubenCount}
            bubenWith={bubenWith}
            setBubenWith={setBubenWith}
            hand={hand}
            setHand={setHand}
            schneider={schneider}
            setSchneider={setSchneider}
            schneiderAnnounced={schneiderAnnounced}
            setSchneiderAnnounced={setSchneiderAnnounced}
            schwarz={schwarz}
            setSchwarz={setSchwarz}
            schwarzAnnounced={schwarzAnnounced}
            setSchwarzAnnounced={setSchwarzAnnounced}
            ouvert={ouvert}
            setOuvert={setOuvert}
            kontra={kontra}
            setKontra={setKontra}
            re={re}
            setRe={setRe}
            isBock={isBock}
            setIsBock={setIsBock}
            isTischramsch={isTischramsch}
            setIsTischramsch={setIsTischramsch}
            ramschSchieben={ramschSchieben}
            setRamschSchieben={setRamschSchieben}
            ramschJungfrau={ramschJungfrau}
            setRamschJungfrau={setRamschJungfrau}
            ramschPlayerPoints={ramschPlayerPoints}
            setRamschPlayerPoints={setRamschPlayerPoints}
            ramschSkatPoints={ramschSkatPoints}
            setRamschSkatPoints={setRamschSkatPoints}
            activePlayers={activePlayers}
            players={players}
            gameState={gameState}
            preview={preview}
            saving={saving}
            onSubmit={handleSubmitGame}
            onCancel={resetForm}
          />
        )}

        {/* Abrechnung (Euro settlement - end of evening) */}
        {games.length > 0 && (
          <div className="mt-4 space-y-3">
            <button
              onClick={() => setShowAbrechnung(!showAbrechnung)}
              className="w-full py-3 border border-slate-600 text-slate-300 rounded-xl hover:bg-slate-700/50 transition-all flex items-center justify-center gap-2 font-medium"
            >
              <Trophy className="w-5 h-5 text-amber-500" />
              {showAbrechnung ? 'Abrechnung ausblenden' : 'Abrechnung anzeigen'}
              {showAbrechnung ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showAbrechnung && (
              <AbrechnungTable players={players} centPerPoint={session.cent_per_point} />
            )}
            <ExportSummary session={session} players={players} games={games} />
          </div>
        )}
      </div>
    </div>
  );
}

function calculateRamschValue(schieben: number, jungfrau: boolean, durchmarsch: boolean, base: number): number {
  let value = base;
  for (let i = 0; i < schieben; i++) value *= 2;
  if (jungfrau) value *= 2;
  return value;
}

// Queue Banner Component
function QueueBanner({
  queue,
  gameNumber,
  totalBockGames,
  playerCount,
  onSpaltarsch
}: {
  queue: QueueItem[];
  gameNumber: number;
  totalBockGames: number;
  playerCount: number;
  onSpaltarsch: () => void;
}) {
  void onSpaltarsch;
  const ramschThreshold = 2 * getGamesPerRound(playerCount);
  const gamesPerRound = getGamesPerRound(playerCount);
  const pendingItems = queue.filter(item => item.games_remaining > 0);
  const activeItem = pendingItems[0];

  const buildPreviewChain = (): { label: string; color: string }[] => {
    const chain: { label: string; color: string }[] = [];

    if (activeItem) {
      if (activeItem.type === 'bock') {
        chain.push({ label: `B${activeItem.games_remaining}`, color: 'text-orange-400' });
      } else {
        chain.push({ label: `R${activeItem.games_remaining}`, color: 'text-red-400' });
      }
    } else {
      chain.push({ label: 'N', color: 'text-slate-400' });
    }

    const queuedAfterCurrent = pendingItems.slice(1);

    for (const item of queuedAfterCurrent) {
      if (item.type === 'bock') {
        chain.push({ label: `B${item.games_remaining}`, color: 'text-orange-400' });
      } else {
        chain.push({ label: `R${item.games_remaining}`, color: 'text-red-400' });
      }
    }

    if (queuedAfterCurrent.length === 0) {
      const currentIsBock = activeItem?.type === 'bock';
      const currentIsRamsch = activeItem?.type === 'ramsch';

      if (currentIsBock) {
        const bockCountAfter = totalBockGames + activeItem.games_remaining;
        if (bockCountAfter >= ramschThreshold) {
          chain.push({ label: `R${gamesPerRound}`, color: 'text-red-400' });
          chain.push({ label: 'N', color: 'text-slate-400' });
        } else {
          chain.push({ label: 'N', color: 'text-slate-400' });
        }
      } else if (currentIsRamsch) {
        chain.push({ label: 'N', color: 'text-slate-400' });
      } else {
        chain.push({ label: 'N', color: 'text-slate-400' });
      }
    }

    return chain;
  };

  const previewChain = buildPreviewChain();

  return (
    <div className="mb-6">
      {gameNumber === 0 && !activeItem ? (
        <div className="bg-slate-700/30 rounded-xl px-4 py-3 text-center border border-slate-600/50">
          <Zap className="inline w-5 h-5 text-amber-500 mr-2" />
          <span className="text-slate-300">Das erste Spiel ist ein normales Spiel</span>
        </div>
      ) : activeItem?.type === 'bock' ? (
        <div className="bg-orange-500/20 rounded-xl px-4 py-3 flex items-center justify-between border border-orange-500/30">
          <div className="flex items-center gap-3">
            <Flame className="w-6 h-6 text-orange-400" />
            <div>
              <span className="font-semibold text-orange-300">Bockrunde</span>
              <span className="text-orange-400 ml-2">Noch {activeItem.games_remaining} Spiele</span>
            </div>
          </div>
        </div>
      ) : activeItem?.type === 'ramsch' ? (
        <div className="bg-red-500/20 rounded-xl px-4 py-3 flex items-center justify-between border border-red-500/30">
          <div className="flex items-center gap-3">
            <Target className="w-6 h-6 text-red-400" />
            <div>
              <span className="font-semibold text-red-300">Ramsch</span>
              <span className="text-red-400 ml-2">Noch {activeItem.games_remaining} Spiele</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-700/30 rounded-xl px-4 py-3 flex items-center justify-between border border-slate-600/50">
          <div className="flex items-center gap-3">
            <Zap className="w-5 h-5 text-slate-400" />
            <span className="text-slate-300">Normales Spiel (#{gameNumber + 1})</span>
            <span className="text-slate-500">| Bockzähler: {totalBockGames}/{ramschThreshold}</span>
          </div>
          {totalBockGames >= ramschThreshold - 1 && (
            <span className="text-amber-400 text-sm">Nächstes Bockspiel löst Ramsch aus!</span>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2 flex-wrap text-sm">
        {previewChain.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            {idx > 0 && <ArrowRight className="w-4 h-4 text-slate-600" />}
            <span className={`font-bold ${item.color}`}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Game Input Form Component
function GameInputForm({
  gameType,
  setGameType,
  gameResult,
  setGameResult,
  soloistId,
  setSoloistId,
  bubenCount,
  setBubenCount,
  bubenWith,
  setBubenWith,
  hand,
  setHand,
  schneider,
  setSchneider,
  schneiderAnnounced,
  setSchneiderAnnounced,
  schwarz,
  setSchwarz,
  schwarzAnnounced,
  setSchwarzAnnounced,
  ouvert,
  setOuvert,
  kontra,
  setKontra,
  re,
  setRe,
  isBock,
  setIsBock,
  isTischramsch,
  setIsTischramsch,
  ramschSchieben,
  setRamschSchieben,
  ramschJungfrau,
  setRamschJungfrau,
  ramschPlayerPoints,
  setRamschPlayerPoints,
  ramschSkatPoints,
  setRamschSkatPoints,
  activePlayers,
  players,
  gameState,
  preview,
  saving,
  onSubmit,
  onCancel,
}: {
  gameType: GameType | '';
  setGameType: (t: GameType | '') => void;
  gameResult: 'won' | 'lost' | '';
  setGameResult: (r: 'won' | 'lost' | '') => void;
  soloistId: string;
  setSoloistId: (id: string) => void;
  bubenCount: number | null;
  setBubenCount: (n: number | null) => void;
  bubenWith: boolean | null;
  setBubenWith: (b: boolean | null) => void;
  hand: boolean;
  setHand: (b: boolean) => void;
  schneider: boolean;
  setSchneider: (b: boolean) => void;
  schneiderAnnounced: boolean;
  setSchneiderAnnounced: (b: boolean) => void;
  schwarz: boolean;
  setSchwarz: (b: boolean) => void;
  schwarzAnnounced: boolean;
  setSchwarzAnnounced: (b: boolean) => void;
  ouvert: boolean;
  setOuvert: (b: boolean) => void;
  kontra: boolean;
  setKontra: (b: boolean) => void;
  re: boolean;
  setRe: (b: boolean) => void;
  isBock: boolean;
  setIsBock: (b: boolean) => void;
  isTischramsch: boolean;
  setIsTischramsch: (b: boolean) => void;
  ramschSchieben: number;
  setRamschSchieben: (n: number) => void;
  ramschJungfrau: boolean;
  setRamschJungfrau: (b: boolean) => void;
  ramschPlayerPoints: Record<string, number>;
  setRamschPlayerPoints: (pts: Record<string, number>) => void;
  ramschSkatPoints: number;
  setRamschSkatPoints: (n: number) => void;
  activePlayers: SessionPlayer[];
  players: SessionPlayer[];
  gameState: { isBockRound: boolean; isRamschRound: boolean; gamesRemaining: number };
  preview: { value: number; display: string };
  saving: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const gt = gameType || null;
  const showBuben = gt ? needsBuben(gt) : false;
  const isRamsch = gt ? isRamschGame(gt) : false;
  void isNullGame;

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50 mb-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-white">Neues Spiel eintragen</h2>
        <button onClick={onCancel} className="text-slate-400 hover:text-white">
          <XCircle className="w-6 h-6" />
        </button>
      </div>

      <div className="space-y-5">
        {/* Player Selection (non-Ramsch) - no heading */}
        {!isRamsch && (
          <div className="flex flex-wrap gap-2">
            {activePlayers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSoloistId(p.id)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  soloistId === p.id
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        {/* Buben Selection - single line: mit1/2/3/4 ohne1/2/3/4 - always visible */}
        <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={`mit${n}`}
                type="button"
                onClick={() => { setBubenWith(true); setBubenCount(n); }}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                  bubenWith && bubenCount === n
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                }`}
              >
                mit{n}
              </button>
            ))}
            {[1, 2, 3, 4].map((n) => (
              <button
                key={`ohne${n}`}
                type="button"
                onClick={() => { setBubenWith(false); setBubenCount(4 - n); }}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                  !bubenWith && bubenCount === 4 - n
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                }`}
              >
                ohne{n}
              </button>
            ))}
        </div>

        {/* Game Type Selection - two rows, smaller buttons */}
        <div className="space-y-1.5">
          {/* Row 1: Suit games + Grand */}
          <div className="flex flex-wrap gap-1.5">
            {(['kreuz', 'pik', 'herz', 'karo', 'grand'] as GameType[]).map((gt) => (
              <button
                key={gt}
                type="button"
                onClick={() => setGameType(gameType === gt ? '' : gt)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                  gameType === gt
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {gt === 'kreuz' ? 'Kreuz' : gt === 'pik' ? 'Pik' : gt === 'herz' ? 'Herz' : gt === 'karo' ? 'Karo' : 'Grand'}
              </button>
            ))}
          </div>
          {/* Row 2: Null games + Tischramsch (Ramsch removed from manual selection) */}
          <div className="flex flex-wrap gap-1.5">
            {(['null', 'null_hand', 'null_ouvert', 'null_ouvert_hand', 'revolution', 'tischramsch'] as GameType[]).map((gt) => (
              <button
                key={gt}
                type="button"
                onClick={() => setGameType(gameType === gt ? '' : gt)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                  gameType === gt
                    ? isNullGame(gt)
                      ? 'bg-blue-500 text-white'
                      : 'bg-red-500 text-white'
                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {gt === 'null' ? 'Null' : gt === 'null_hand' ? 'Null Hand' : gt === 'null_ouvert' ? 'Null Ouvert' : gt === 'null_ouvert_hand' ? 'Null Ouvert Hand' : gt === 'revolution' ? 'Revolution' : 'Tischramsch'}
              </button>
            ))}
          </div>
        </div>

        {/* Zusätze - no heading, single line */}
        {showBuben && (
          <div className="flex flex-wrap gap-1.5">
            <ToggleButton active={hand} onClick={() => setHand(!hand)} label="Hand" small />
            <ToggleButton active={schneider} onClick={() => { setSchneider(!schneider); if (!schneider) setSchneiderAnnounced(false); }} label="Schneider" small />
            <ToggleButton active={schneiderAnnounced} onClick={() => { setSchneiderAnnounced(!schneiderAnnounced); if (!schneiderAnnounced) setSchneider(true); }} label="Schneider anges." small />
            <ToggleButton active={schwarz} onClick={() => { setSchwarz(!schwarz); if (!schwarz) setSchwarzAnnounced(false); }} label="Schwarz" small />
            <ToggleButton active={schwarzAnnounced} onClick={() => { setSchwarzAnnounced(!schwarzAnnounced); if (!schwarzAnnounced) setSchwarz(true); }} label="Schwarz anges." small />
          </div>
        )}

        {/* Kontra/Re left, Won/Lost right - same row */}
        {!isRamsch && (
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-1.5">
              <ToggleButton active={kontra} onClick={() => setKontra(!kontra)} label="Kontra" small disabled={!soloistId} />
              <ToggleButton active={re} onClick={() => setRe(!re)} label="Re" small disabled={!kontra} />
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setGameResult(gameResult === 'won' ? '' : 'won')}
                className={`px-4 py-2 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                  gameResult === 'won'
                    ? 'bg-green-500 text-white'
                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <Check className="w-4 h-4" /> Gewonnen
              </button>
              <button
                type="button"
                onClick={() => setGameResult(gameResult === 'lost' ? '' : 'lost')}
                className={`px-4 py-2 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
                  gameResult === 'lost'
                    ? 'bg-red-500 text-white'
                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <XCircle className="w-4 h-4" /> Verloren
              </button>
            </div>
          </div>
        )}

        {/* Bockspiel toggle (only outside Bock round, non-Ramsch) */}
        {!gameState.isBockRound && !isRamsch && (
          <div>
            <ToggleButton active={isBock} onClick={() => setIsBock(!isBock)} label="Bockspiel" small />
          </div>
        )}

        {/* Ramsch Options */}
        {isRamsch && (
          <div className="space-y-3 border-t border-slate-600/50 pt-4">
            <label className="block text-sm font-medium text-slate-300">
              {gameType === 'tischramsch' ? 'Tischramsch' : 'Ramsch'}
            </label>

            {/* Jungfrau - styled like point input row, directly above inputs */}
            <div className="flex items-center gap-3">
              <span className="w-24 text-sm font-medium text-slate-300">Jungfrau</span>
              <button
                type="button"
                onClick={() => setRamschJungfrau(!ramschJungfrau)}
                className={`w-24 px-3 py-2 rounded-lg text-center font-medium transition-all ${
                  ramschJungfrau
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-900/50 border border-slate-600 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {ramschJungfrau ? 'Ja' : 'Nein'}
              </button>
            </div>

            {/* Per-player point inputs */}
            <div className="space-y-2">
              {activePlayers.map((p) => {
                const val = ramschPlayerPoints[p.id] ?? 0;
                const pts = activePlayers.map(pl => ramschPlayerPoints[pl.id] ?? 0);
                const maxPts = Math.max(...pts);
                const isLoser = val === maxPts && val > 0;
                return (
                  <div key={p.id} className="flex items-center gap-3">
                    <span className={`w-24 text-sm font-medium truncate ${isLoser ? 'text-red-400' : 'text-slate-300'}`}>{p.name}</span>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      value={val === 0 ? '' : val}
                      placeholder="0"
                      onChange={(e) => {
                        const n = Math.max(0, Math.min(120, parseInt(e.target.value) || 0));
                        setRamschPlayerPoints({ ...ramschPlayerPoints, [p.id]: n });
                      }}
                      className="w-24 px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-center focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    {isLoser && val > 0 && <span className="text-xs text-red-400 font-medium">Verlierer</span>}
                  </div>
                );
              })}
              {/* Skat field with inline checkmark */}
              <div className="flex items-center gap-3 border-t border-slate-700/50 pt-2">
                <span className="w-24 text-sm font-medium text-slate-400">Skat</span>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={ramschSkatPoints === 0 ? '' : ramschSkatPoints}
                  placeholder="0"
                  onChange={(e) => setRamschSkatPoints(Math.max(0, Math.min(120, parseInt(e.target.value) || 0)))}
                  className="w-24 px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-center focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                {(() => {
                  const total = activePlayers.reduce((s, p) => s + (ramschPlayerPoints[p.id] ?? 0), 0) + ramschSkatPoints;
                  return total === 120 ? <Check className="w-5 h-5 text-green-400" /> : null;
                })()}
              </div>
            </div>

            {/* Geschoben - only for normal Ramsch, not Tischramsch */}
            {gameType !== 'tischramsch' && (
              <div className="flex items-center gap-4">
                <span className="text-slate-400 text-sm">Geschoben:</span>
                <button type="button" onClick={() => setRamschSchieben(Math.max(0, ramschSchieben - 1))} className="p-2 bg-slate-700 rounded-lg text-white">
                  <Minus className="w-4 h-4" />
                </button>
                <span className="text-xl font-bold text-white w-8 text-center">{ramschSchieben}</span>
                <button type="button" onClick={() => setRamschSchieben(ramschSchieben + 1)} className="p-2 bg-slate-700 rounded-lg text-white">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Live Preview */}
        <div className="bg-slate-900/50 rounded-lg p-4 border border-amber-500/30">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-5 h-5 text-amber-400" />
            <span className="text-sm font-medium text-amber-400">Vorschau</span>
          </div>
          <p className="text-slate-300 text-sm font-medium">{preview.display}</p>
        </div>

        {/* Submit Buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 bg-slate-700 text-white font-semibold rounded-lg hover:bg-slate-600 transition-all"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={saving || !gameType || (!isRamsch && (!soloistId || !gameResult)) || (isRamsch && activePlayers.reduce((s, p) => s + (ramschPlayerPoints[p.id] ?? 0), 0) + ramschSkatPoints !== 120)}
            className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold rounded-lg hover:from-green-600 hover:to-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Speichern...
              </span>
            ) : (
              'Spiel speichern'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Toggle Button Component
function ToggleButton({ active, onClick, label, disabled, small }: { active: boolean; onClick: () => void; label: string; disabled?: boolean; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${small ? 'px-3 py-1.5 rounded text-sm' : 'px-3 py-2 rounded-lg text-sm'} font-medium transition-all ${
        active
          ? 'bg-amber-500 text-white'
          : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {label}
    </button>
  );
}

// Generate compact Anzeige notation like ♥ 10×(2+1+1), G 24×(3+1)×2, NH 35×2
function generateAnzeige(game: Game): string {
  if (isRamschGame(game.game_type)) {
    let label = game.game_type === 'tischramsch' ? 'TR' : 'R';
    if (game.ramsch_schieben_count) label += ` ${game.ramsch_schieben_count}×Sch`;
    if (game.ramsch_jungfrau) label += ' Jf';
    if (game.ramsch_durchmarsch) label += ' DM';
    return label;
  }

  if (isNullGame(game.game_type)) {
    const nullLabels: Record<string, string> = {
      null: 'N', null_hand: 'NH', null_ouvert: 'NO', null_ouvert_hand: 'NOH', revolution: 'Rev',
    };
    const baseVals: Record<string, number> = {
      null: 23, null_hand: 35, null_ouvert: 46, null_ouvert_hand: 59, revolution: 96,
    };
    let label = `${nullLabels[game.game_type] || 'N'} ${baseVals[game.game_type] || 0}`;
    if (game.kontra) label += '×2';
    if (game.re) label += '×2';
    if (game.is_bock) label += '×2';
    return label;
  }

  const suitSymbols: Record<string, string> = {
    kreuz: '\u2663', pik: '\u2660', herz: '\u2665', karo: '\u2666', grand: 'G',
  };
  const suitVals: Record<string, number> = {
    kreuz: 12, pik: 11, herz: 10, karo: 9, grand: 24,
  };
  const symbol = suitSymbols[game.game_type] || game.game_type;
  const sv = suitVals[game.game_type] || 0;
  const buben = game.buben_count ?? 0;

  const stages: number[] = [buben, 1];
  if (game.hand) stages.push(1);
  if (game.schneider) stages.push(1);
  if (game.schneider_announced) stages.push(1);
  if (game.schwarz) stages.push(1);
  if (game.schwarz_announced) stages.push(1);

  let notation = `${symbol} ${sv}\u00d7(${stages.join('+')})`;
  if (game.kontra) notation += '\u00d72';
  if (game.re) notation += '\u00d72';
  if (game.is_bock) notation += '\u00d72';
  return notation;
}

// Combined Skat-Zettel: Spieltisch + Spielliste in one table
function SkatZettelTable({
  games,
  players,
  currentDealer,
  activePlayers,
  playerCount,
}: {
  games: (Game & { scores?: { player_id: string; score_change: number }[] })[];
  players: SessionPlayer[];
  currentDealer: SessionPlayer | null;
  activePlayers: SessionPlayer[];
  playerCount: number;
}) {
  const getScore = (game: Game & { scores?: { player_id: string; score_change: number }[] }, playerId: string): number | null => {
    if (game.scores) {
      const s = game.scores.find(sc => sc.player_id === playerId);
      return s ? s.score_change : null;
    }
    if (!isRamschGame(game.game_type) && game.soloist_id === playerId) {
      return game.won ? game.calculated_value : -game.calculated_value;
    }
    return null;
  };

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl overflow-hidden border border-slate-700/50 mb-6">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-900/70 border-b border-slate-700/50">
              <th className="text-left py-3 px-3 text-slate-400 font-semibold">Nr</th>
              <th className="text-left py-3 px-3 text-slate-400 font-semibold">Anzeige</th>
              {players.map(p => {
                const isDealer = currentDealer?.id === p.id;
                const isSittingOut = playerCount > 3 && !activePlayers.some(a => a.id === p.id) && !isDealer;
                return (
                  <th key={p.id} className={`text-right py-3 px-3 font-semibold min-w-[80px] ${isDealer ? 'text-amber-400' : 'text-slate-200'}`}>
                    <div className="flex flex-col items-end gap-0.5">
                      <span>{p.name}{isDealer ? ' \u25bc' : ''}</span>
                      {isSittingOut && (
                        <span className="text-xs font-normal text-slate-500">sitzt aus</span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
            {/* Running total row */}
            <tr className="bg-slate-700/40 border-b border-slate-600/50">
              <td className="py-2 px-3 text-slate-400 font-bold text-base">&Sigma;</td>
              <td className="py-2 px-3 text-slate-500 text-xs">Summe</td>
              {players.map(p => (
                <td key={p.id} className={`text-right py-2 px-3 font-bold text-base ${p.total_score >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {p.total_score > 0 ? '+' : ''}{p.total_score}
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {games.length === 0 ? (
              <tr>
                <td colSpan={players.length + 2} className="py-8 text-center text-slate-500">
                  Noch keine Spiele eingetragen
                </td>
              </tr>
            ) : (
              [...games].reverse().map(game => (
                <tr
                  key={game.id}
                  className={`border-t border-slate-700/20 hover:bg-slate-700/20 transition-colors ${
                    game.is_bock ? 'bg-orange-500/5' : game.is_ramsch ? 'bg-red-500/5' : ''
                  }`}
                >
                  <td className="py-2 px-3 text-slate-400 text-xs font-medium">{game.game_number}</td>
                  <td className="py-2 px-3 font-mono text-xs text-slate-300 whitespace-nowrap">
                    {generateAnzeige(game)}
                    {!game.won && !isRamschGame(game.game_type) && (
                      <span className="ml-1 text-red-400 text-xs">v</span>
                    )}
                  </td>
                  {players.map(p => {
                    const sc = getScore(game, p.id);
                    return (
                      <td key={p.id} className={`text-right py-2 px-3 font-medium tabular-nums ${
                        sc === null ? 'text-slate-700' : sc > 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {sc !== null ? (sc > 0 ? '+' : '') + sc : ''}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Abrechnung (Euro settlement) table
function AbrechnungTable({ players, centPerPoint }: { players: SessionPlayer[]; centPerPoint: number }) {
  const n = players.length;

  // Build pairwise diff rows: for each pair (i,j) with i<j, show S_i - S_j for each player column
  const pairs: { i: number; j: number; diff: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      pairs.push({ i, j, diff: players[i].total_score - players[j].total_score });
    }
  }

  const balances = players.map(p =>
    players.filter(o => o.id !== p.id).reduce((s, o) => s + (p.total_score - o.total_score), 0)
  );

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl overflow-hidden border border-slate-700/50">
      <div className="p-4 border-b border-slate-700/50">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-500" />
          Abrechnung ({centPerPoint} Ct/Punkt)
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-900/50 border-b border-slate-700/50">
              <th className="text-left py-3 px-4 text-slate-400 font-medium">Vergleich</th>
              {players.map(p => (
                <th key={p.id} className="text-right py-3 px-4 text-slate-300 font-semibold">{p.name}</th>
              ))}
            </tr>
            <tr className="bg-slate-700/20 border-b border-slate-600/30">
              <td className="py-2 px-4 text-slate-400 text-xs">Summe aller Punkte</td>
              {players.map(p => (
                <td key={p.id} className={`text-right py-2 px-4 font-bold ${p.total_score >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {p.total_score > 0 ? '+' : ''}{p.total_score}
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {pairs.map(({ i, j, diff }) => (
              <tr key={`${i}-${j}`} className="border-t border-slate-700/20">
                <td className="py-2 px-4 text-slate-400 text-xs whitespace-nowrap">
                  {players[i].name} \u2212 {players[j].name}
                </td>
                {players.map((_, k) => {
                  let val: number | null = null;
                  if (k === i) val = diff;
                  else if (k === j) val = -diff;
                  return (
                    <td key={k} className={`text-right py-2 px-4 font-medium tabular-nums ${
                      val === null ? '' : val > 0 ? 'text-green-400' : val < 0 ? 'text-red-400' : 'text-slate-400'
                    }`}>
                      {val !== null ? (val > 0 ? '+' : '') + val : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-600/50 bg-slate-700/30">
              <td className="py-3 px-4 text-slate-300 font-semibold">Saldo</td>
              {balances.map((bal, idx) => (
                <td key={idx} className={`text-right py-3 px-4 font-bold text-base tabular-nums ${bal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {bal > 0 ? '+' : ''}{bal}
                </td>
              ))}
            </tr>
            <tr className="border-t border-slate-600/30 bg-slate-700/50">
              <td className="py-3 px-4 text-slate-300 font-semibold">&times; {centPerPoint} Ct = Euro</td>
              {balances.map((bal, idx) => {
                const euro = (bal * centPerPoint / 100).toFixed(2);
                return (
                  <td key={idx} className={`text-right py-3 px-4 font-bold text-base tabular-nums ${bal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {bal > 0 ? '+' : ''}{euro} &euro;
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// Export Summary Component
function ExportSummary({
  session,
  players,
  games,
}: {
  session: Session;
  players: SessionPlayer[];
  games: Game[];
}) {
  const handleExport = () => {
    // Generate simple HTML for printing
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html lang="de">
      <head>
        <meta charset="UTF-8">
        <title>Skat Abrechnung - ${session.name}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
          h1 { color: #1e293b; margin-bottom: 10px; }
          h2 { color: #475569; font-size: 18px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
          th { background: #f1f5f9; font-weight: 600; }
          .positive { color: #16a34a; }
          .negative { color: #dc2626; }
          .total { font-weight: bold; background: #f8fafc; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <h1>Skat Abrechnung</h1>
        <h2>${session.name} - ${new Date(session.created_at).toLocaleDateString('de-DE')}</h2>

        <h3>Abrechnung (${session.cent_per_point} Ct/Punkt)</h3>
        <table>
          <tr>
            <th></th>
            ${players.map(p => `<th>${p.name}</th>`).join('')}
          </tr>
          <tr>
            <td><strong>Punkte</strong></td>
            ${players.map(p => `<td>${p.total_score > 0 ? '+' : ''}${p.total_score}</td>`).join('')}
          </tr>
          ${players.map((pi, i) =>
            players.filter((_, j) => j > i).map(pj => `
              <tr>
                <td>${pi.name} - ${pj.name}</td>
                ${players.map(pk => {
                  if (pk.id === pi.id) return `<td>${pi.total_score - pj.total_score}</td>`;
                  if (pk.id === pj.id) return `<td>${-(pi.total_score - pj.total_score)}</td>`;
                  return `<td></td>`;
                }).join('')}
              </tr>
            `).join('')
          ).join('')}
          <tr class="total">
            <td><strong>Saldo</strong></td>
            ${players.map(p => {
              const balance = players.filter(o => o.id !== p.id).reduce((s, o) => s + (p.total_score - o.total_score), 0);
              return `<td class="${balance >= 0 ? 'positive' : 'negative'}">${balance > 0 ? '+' : ''}${balance}</td>`;
            }).join('')}
          </tr>
          <tr class="total">
            <td><strong>Euro (${session.cent_per_point} Ct)</strong></td>
            ${players.map(p => {
              const balance = players.filter(o => o.id !== p.id).reduce((s, o) => s + (p.total_score - o.total_score), 0);
              const euro = (balance * session.cent_per_point / 100).toFixed(2);
              return `<td class="${balance >= 0 ? 'positive' : 'negative'}">${Number(euro) > 0 ? '+' : ''}${euro} €</td>`;
            }).join('')}
          </tr>
        </table>

        <h3>Spielliste (${games.length} Spiele)</h3>
        <table>
          <tr><th>Nr.</th><th>Anzeige</th>${players.map(p => `<th>${p.name}</th>`).join('')}</tr>
          ${[...games].reverse().map(g => {
            const soloistChange = g.won ? g.calculated_value : -g.calculated_value;
            return `
            <tr>
              <td>${g.game_number}</td>
              <td style="font-family:monospace">${generateAnzeige(g)}${!g.won && !g.is_ramsch ? ' v' : ''}</td>
              ${players.map(p => {
                const isRamschL = g.is_ramsch && g.ramsch_loser_id === p.id;
                const isDM = g.is_ramsch && g.ramsch_durchmarsch && p.id === players.find(pl => pl.id === g.soloist_id)?.id;
                const isSoloist = !g.is_ramsch && g.soloist_id === p.id;
                let val: number | null = null;
                if (isSoloist) val = soloistChange;
                else if (isRamschL) val = -g.calculated_value * (players.length - 1);
                else if (isDM) val = g.calculated_value * (players.length - 1);
                return `<td style="text-align:right;color:${val === null ? '#94a3b8' : val >= 0 ? '#16a34a' : '#dc2626'}">${
                  val !== null ? (val > 0 ? '+' : '') + val : ''
                }</td>`;
              }).join('')}
            </tr>`;
          }).join('')}
          <tr class="total">
            <td><strong>\u03a3</strong></td>
            <td></td>
            ${players.map(p => `<td style="text-align:right;font-weight:bold;color:${p.total_score >= 0 ? '#16a34a' : '#dc2626'}">${p.total_score > 0 ? '+' : ''}${p.total_score}</td>`).join('')}
          </tr>
        </table>

        <p style="color: #64748b; font-size: 14px;">
          Generiert am ${new Date().toLocaleDateString('de-DE')} um ${new Date().toLocaleTimeString('de-DE')}
        </p>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  };

  return (
    <button
      onClick={handleExport}
      className="w-full py-4 bg-slate-700 text-white font-semibold rounded-xl hover:bg-slate-600 transition-all flex items-center justify-center gap-2"
    >
      <Download className="w-5 h-5" />
      Abrechnung exportieren (PDF)
    </button>
  );
}
