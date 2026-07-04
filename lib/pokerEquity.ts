// ─── Card representation ──────────────────────────────────────────────────────
// rank: 0=2, 1=3 … 8=T, 9=J, 10=Q, 11=K, 12=A
// suit: 0=s, 1=h, 2=d, 3=c
// card = rank * 4 + suit  (0–51)

export const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
export const SUITS = ["♠","♥","♦","♣"];
// 4-colour deck (standard in online poker): spades black, hearts red, diamonds blue, clubs green
export const SUIT_COLORS = ["#111827","#DC2626","#2563EB","#16A34A"];

export function card(rank: number, suit: number): number { return rank * 4 + suit; }
export function rankOf(c: number): number { return Math.floor(c / 4); }
export function suitOf(c: number): number { return c % 4; }
export function cardLabel(c: number): string { return RANKS[rankOf(c)] + SUITS[suitOf(c)]; }
export function suitColor(c: number): string { return SUIT_COLORS[suitOf(c)]; }

export const FULL_DECK: number[] = Array.from({ length: 52 }, (_, i) => i);

// ─── 5-card hand evaluator ────────────────────────────────────────────────────
// Returns a numeric score: higher = better hand.
// Encoding: [hand-type(4)] [kickers in desc order (4 bits each)]

function evalFive(cards: number[]): number {
  const rs = cards.map(rankOf).sort((a, b) => b - a);
  const ss = cards.map(suitOf);

  const isFlush  = ss.every((s) => s === ss[0]);
  const counts: Record<number,number> = {};
  for (const r of rs) counts[r] = (counts[r] ?? 0) + 1;
  const freq = Object.entries(counts).sort((a, b) => b[1] - a[1] || Number(b[0]) - Number(a[0]));
  const byFreq = freq.flatMap(([r, c]) => Array(c).fill(Number(r)));

  // Straight detection (including A-2-3-4-5 wheel)
  const uniq = [...new Set(rs)];
  let isStraight = false;
  let strHigh = uniq[0];
  if (uniq.length === 5 && uniq[0] - uniq[4] === 4) {
    isStraight = true;
  } else if (uniq.join(",") === "12,3,2,1,0") { // A-2-3-4-5
    isStraight = true;
    strHigh = 3; // 5-high straight
  }

  if (isStraight && isFlush) return score(8, strHigh);
  if (freq[0][1] === 4)      return score(7, ...byFreq);
  if (freq[0][1] === 3 && freq[1][1] === 2) return score(6, ...byFreq);
  if (isFlush)               return score(5, ...rs);
  if (isStraight)            return score(4, strHigh);
  if (freq[0][1] === 3)      return score(3, ...byFreq);
  if (freq[0][1] === 2 && freq[1][1] === 2) return score(2, ...byFreq);
  if (freq[0][1] === 2)      return score(1, ...byFreq);
  return score(0, ...rs);
}

function score(type: number, ...kickers: number[]): number {
  let s = type * (16 ** 5);
  for (let i = 0; i < 5; i++) s += (kickers[i] ?? 0) * (16 ** (4 - i));
  return s;
}

// Best hand from any number of cards (picks best 5)
function bestHand(cards: number[]): number {
  const n = cards.length;
  if (n < 5) return -1;
  if (n === 5) return evalFive(cards);
  let best = -1;
  for (let i = 0; i < n - 4; i++)
    for (let j = i + 1; j < n - 3; j++)
      for (let k = j + 1; k < n - 2; k++)
        for (let l = k + 1; l < n - 1; l++)
          for (let m = l + 1; m < n; m++) {
            const s = evalFive([cards[i], cards[j], cards[k], cards[l], cards[m]]);
            if (s > best) best = s;
          }
  return best;
}

// ─── Monte Carlo equity ───────────────────────────────────────────────────────

export type EquityResult = { wins: number; ties: number; losses: number; equity: number }[];

export function calcEquity(
  hands: number[][],       // each hand: 0, 1 or 2 hole cards (−1 = unknown)
  board: number[],         // 0–5 known board cards (−1 = unknown)
  iterations = 10_000
): EquityResult {
  const known = new Set([
    ...hands.flat().filter((c) => c >= 0),
    ...board.filter((c) => c >= 0),
  ]);
  const deck = FULL_DECK.filter((c) => !known.has(c));
  const boardNeeded = 5 - board.filter((c) => c >= 0).length;
  const n = hands.length;
  const results: EquityResult = hands.map(() => ({ wins: 0, ties: 0, losses: 0, equity: 0 }));

  for (let iter = 0; iter < iterations; iter++) {
    // Shuffle remaining deck
    shuffle(deck);
    let idx = 0;

    // Fill unknown hole cards
    const filledHands = hands.map((h) =>
      h.map((c) => (c >= 0 ? c : deck[idx++]))
    );

    // Fill board
    const filledBoard = [...board.filter((c) => c >= 0)];
    for (let i = 0; i < boardNeeded; i++) filledBoard.push(deck[idx++]);

    // Evaluate each hand
    const scores = filledHands.map((h) => bestHand([...h, ...filledBoard]));
    const maxScore = Math.max(...scores);
    const winners = scores.filter((s) => s === maxScore).length;

    for (let i = 0; i < n; i++) {
      if (scores[i] === maxScore) {
        if (winners === 1) results[i].wins++;
        else results[i].ties++;
      } else {
        results[i].losses++;
      }
    }
  }

  for (const r of results) {
    r.equity = (r.wins + r.ties / 2) / iterations;
  }

  return results;
}

function shuffle(arr: number[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
