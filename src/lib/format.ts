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

/** Parse a user-edited result string back to the integer the DB uses. */
export function parseResult(
  input: string,
  eventId: string,
  kind: Kind,
): number | null {
  const s = input.trim();
  if (!s) return null;

  if (eventId === "333mbf") return null; // editing MBLD is too involved

  if (eventId === "333fm") {
    if (kind === "s") {
      const n = parseInt(s, 10);
      return Number.isFinite(n) && n > 0 ? n : null;
    }
    const n = parseFloat(s);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
  }

  // Parse "M:SS.cs" or "S.cs"
  const m = s.match(/^(?:(\d+):)?(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  const minutes = m[1] ? parseInt(m[1], 10) : 0;
  const seconds = parseInt(m[2], 10);
  const csStr = m[3] ?? "00";
  const cs = parseInt(csStr.padEnd(2, "0"), 10);
  const total = (minutes * 60 + seconds) * 100 + cs;
  return total > 0 ? total : null;
}
