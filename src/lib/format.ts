import { formatMultiBld } from "./multibld";
import type { Kind } from "./kinch";

/**
 * Format a WCA result value for display.
 *
 *   333mbf:            decoded to "S/A M:SS"
 *   333fm single:      move count, e.g. 25 → "25"
 *   333fm average:     stored as moves × 100, e.g. 2533 → "25.33"
 *   everything else:   centiseconds → "M:SS.cs" or "S.cs"
 */
export function formatResult(
  value: number,
  eventId: string,
  kind: Kind,
): string {
  if (!value || value <= 0) return "—";

  if (eventId === "333mbf") {
    return formatMultiBld(value);
  }

  if (eventId === "333fm") {
    return kind === "a" ? (value / 100).toFixed(2) : String(value);
  }

  const totalSeconds = Math.floor(value / 100);
  const cs = value % 100;
  if (totalSeconds >= 60) {
    const min = Math.floor(totalSeconds / 60);
    const sec = totalSeconds % 60;
    return `${min}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  }
  return `${totalSeconds}.${String(cs).padStart(2, "0")}`;
}
