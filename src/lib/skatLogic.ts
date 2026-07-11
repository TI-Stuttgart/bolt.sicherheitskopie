import type { GameType } from './supabase';

// Suit values
export const SUIT_VALUES: Record<string, number> = {
  kreuz: 12,
  pik: 11,
  herz: 10,
  karo: 9,
  grand: 24,
};

// Null game fixed values
export const NULL_VALUES: Record<string, number> = {
  null: 23,
  null_hand: 35,
  null_ouvert: 46,
  null_ouvert_hand: 59,
  revolution: 96,
};

// Check if game is a null game
export function isNullGame(gameType: GameType): boolean {
  return ['null', 'null_hand', 'null_ouvert', 'null_ouvert_hand', 'revolution'].includes(gameType);
}

// Check if game is a Ramsch variant
export function isRamschGame(gameType: GameType): boolean {
  return gameType === 'ramsch' || gameType === 'tischramsch';
}

// Check if game needs Buben (only suit games and Grand)
export function needsBuben(gameType: GameType): boolean {
  return !isNullGame(gameType) && !isRamschGame(gameType);
}

// Calculate the base value for a game
export function calculateBaseGameValue(
  gameType: GameType,
  bubenCount: number | null,
  bubenWith: boolean | null,
  hand: boolean,
  schneider: boolean,
  schneiderAnnounced: boolean,
  schwarz: boolean,
  schwarzAnnounced: boolean
): number {
  if (isNullGame(gameType)) {
    if (gameType === 'revolution') {
      return 96;
    }
    return NULL_VALUES[gameType] || 0;
  }

  const suitValue = SUIT_VALUES[gameType] || 0;
  if (suitValue === 0) return 0;

  let stages = 0;
  if (bubenCount !== null && bubenWith !== null) {
    stages = bubenCount + 1;
  }

  if (hand) stages += 1;
  if (schneider) stages += 1;
  if (schneiderAnnounced) stages += 1;
  if (schwarz) stages += 1;
  if (schwarzAnnounced) stages += 1;

  return stages * suitValue;
}

// Calculate the final game value with doublings
export function calculateFinalGameValue(
  baseValue: number,
  kontra: boolean,
  re: boolean,
  isBock: boolean
): number {
  let value = baseValue;
  if (kontra) value *= 2;
  if (re) value *= 2;
  if (isBock) value *= 2;
  return value;
}

// Check if a game triggers a Bock round
export function triggersBockRound(
  gameType: GameType,
  baseValue: number,
  won: boolean,
  hand: boolean = false,
  kontra: boolean = false,
  re: boolean = false
): boolean {
  if (gameType === 'grand' && hand) return true;
  if (gameType === 'revolution') return true;
  if (!won && kontra) return true;
  if (re) return true;
  if (!won) return false;
  if (baseValue >= 96) return true;
  return false;
}

export function isGrandHand(gameType: GameType, hand: boolean): boolean {
  return gameType === 'grand' && hand;
}

// Get number of Bock/Ramsch games per round
export function getGamesPerRound(playerCount: number): number {
  return playerCount;
}

// Check if Spaltarsch (exactly 60 points)
export function isSpaltarsch(points: number): boolean {
  return points === 60;
}

// For Ramsch: Calculate the ramsch value
export function calculateRamschValue(
  schiebenCount: number,
  jungfrau: boolean,
  _durchmarsch: boolean,
  baseValue: number = 60
): number {
  let value = baseValue;
  for (let i = 0; i < schiebenCount; i++) {
    value *= 2;
  }
  if (jungfrau) value *= 2;
  return value;
}

// Tischramsch calculation
export function calculateTischramsch(loserPoints: number, jungfrau: boolean, bock: boolean): number {
  let value = loserPoints * 2;
  if (jungfrau) value *= 2;
  if (bock) value *= 2;
  return -value;
}

// Get next dealer
export function getNextDealerIndex(currentDealerIndex: number, playerCount: number): number {
  return (currentDealerIndex + 1) % playerCount;
}

// Bei 5 Spielern sitzt der 4. Spieler nach dem Geber (nicht der 3.)
export function getSitterIndex(dealerIndex: number, playerCount: number): number | null {
  if (playerCount < 5) return null;
  return (dealerIndex + 4) % playerCount;
}

// Get active player indices (excludes sitter in 5-player games)
export function getActivePlayerIndices(playerCount: number, dealerIndex: number): number[] {
  const indices: number[] = [];
  for (let i = 0; i < playerCount; i++) {
    if (playerCount === 5 && i === getSitterIndex(dealerIndex, 5)) continue;
    indices.push(i);
  }
  return indices;
}
