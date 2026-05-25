/**
 * WCA Multi-Blind result encoding.
 *
 * New format (since 2009): 0DDTTTTTMM
 *   DD = 99 - (solved - missed)
 *   TTTTT = time in seconds (max 99999)
 *   MM = missed
 *
 * Old format (1OOAATTTTT, before 2009):
 *   OO = 99 - solved
 *   AA = attempted
 *   TTTTT = time in seconds
 */
export interface MultiBldResult {
  solved: number;
  attempted: number;
  missed: number;
  points: number;
  timeSeconds: number;
}

export function decodeMultiBld(value: number): MultiBldResult | null {
  if (value <= 0) return null;
  const s = String(value);
  if (s.length < 9) return null;

  if (s.length === 10 && s[0] === "1") {
    // old format 1OOAATTTTT
    const OO = parseInt(s.slice(1, 3), 10);
    const AA = parseInt(s.slice(3, 5), 10);
    const TTTTT = parseInt(s.slice(5, 10), 10);
    const solved = 99 - OO;
    const attempted = AA;
    const missed = attempted - solved;
    const points = solved - missed;
    return { solved, attempted, missed, points, timeSeconds: TTTTT };
  }

  // new format - pad to 10 digits
  const padded = s.padStart(10, "0");
  const DD = parseInt(padded.slice(1, 3), 10);
  const TTTTT = parseInt(padded.slice(3, 8), 10);
  const MM = parseInt(padded.slice(8, 10), 10);
  const difference = 99 - DD;
  const missed = MM;
  const solved = difference + missed;
  const attempted = solved + missed;
  const points = solved - missed;
  return { solved, attempted, missed, points, timeSeconds: TTTTT };
}

/**
 * Score for Kinch ranks: points + proportion of hour left.
 * 41 points 54:14 → 41 + (3600-3254)/3600 = 41.0961
 */
export function multiBldKinchScore(value: number): number {
  const r = decodeMultiBld(value);
  if (!r) return 0;
  if (r.points <= 0) return 0;
  const hourLeft = Math.max(0, (3600 - r.timeSeconds) / 3600);
  return r.points + hourLeft;
}

export function formatMultiBld(value: number): string {
  const r = decodeMultiBld(value);
  if (!r) return "-";
  const m = Math.floor(r.timeSeconds / 60);
  const s = r.timeSeconds % 60;
  return `${r.solved}/${r.attempted} ${m}:${String(s).padStart(2, "0")}`;
}
