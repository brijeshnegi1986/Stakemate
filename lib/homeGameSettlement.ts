export type SettlementPlayer = {
  playerId: number;
  name: string;
  net: number;
};

export type SettlementPayment = {
  playerId: number;
  playerName: string;
  // 'host_owes_player' — host pays the player (player was net positive)
  // 'player_owes_host' — player pays the host (player was net negative)
  direction: "host_owes_player" | "player_owes_host";
  amount: number;
};

// The host is the bank — collects every buy-in/rebuy and pays out every
// cash-out directly, so there's no player-to-player debt to simplify.
// Each player just settles their own net with the host.
export function computeSettlement(players: SettlementPlayer[]): SettlementPayment[] {
  return players
    .filter((p) => Math.abs(p.net) > 0.005)
    .map((p) => ({
      playerId: p.playerId,
      playerName: p.name,
      direction: p.net > 0 ? "host_owes_player" as const : "player_owes_host" as const,
      amount: Math.round(Math.abs(p.net) * 100) / 100,
    }));
}

// Sum of buy-ins/rebuys should equal sum of cash-outs once everyone's cashed
// out; a non-zero total signals a data-entry mistake before settling up.
export function computeImbalance(players: SettlementPlayer[]): number {
  return Math.round(players.reduce((s, p) => s + p.net, 0) * 100) / 100;
}
