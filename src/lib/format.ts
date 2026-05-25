import { formatMultiBld } from "./multibld";

/**
 * Format a WCA result (centiseconds for time events, moves for FM) into a
 * human-readable string.
 *
 *   333fm avg:    e.g. 2533 → "25.33"  (we store fm averages * 100)
 *   333fm single: e.g. 25   → "25"
 *   333mbf:       decoded to "S/A M:SS"
 *   others:       centiseconds → "M:SS.cs" or "S.cs"
 */
export function formatResult(
  value: number,
  eventId: string,
  isAverage: boolean,
): string {
  if (!value || value <= 0) return "-";

  if (eventId === "333mbf") {
    return formatMultiBld(value);
  }

  if (eventId === "333fm") {
    if (isAverage) {
      // average is stored as moves * 100
      return (value / 100).toFixed(2);
    }
    return String(value);
  }

  // Time-based, centiseconds
  const totalCs = value;
  const totalSeconds = Math.floor(totalCs / 100);
  const cs = totalCs % 100;
  if (totalSeconds >= 60) {
    const min = Math.floor(totalSeconds / 60);
    const sec = totalSeconds % 60;
    return `${min}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  }
  return `${totalSeconds}.${String(cs).padStart(2, "0")}`;
}
