// Buzz arbitration: first pointerdown timestamp wins; equal timestamps → lowest seat.
// Deterministic and unit-tested.

export interface Press {
  seat: number;
  playerId: string;
  timeStamp: number;
}

export interface ArbiterOptions {
  lockedSeats: number[];
}

export function resolveBuzz(presses: Press[], opts: ArbiterOptions): Press | null {
  const eligible = presses
    .filter((p) => !opts.lockedSeats.includes(p.seat))
    .sort((a, b) => a.timeStamp - b.timeStamp || a.seat - b.seat);
  return eligible[0] ?? null;
}