import "dotenv/config";
import { getPool } from "../src/lib/db";
import { computeAll, EventData, BestResult, kinchScore, Kind } from "../src/lib/kinch";
import { KINCH_EVENTS } from "../src/lib/events";
import { formatResult } from "../src/lib/format";
import { countryCode, countryName, continentName } from "../src/lib/wca-meta";

/**
 * Prints the full Kinch calculation for one country, in both the
 * all-continents (world record) view and the continent (continental
 * record) view, including every NR/WR/CR result and its holder so each
 * number can be cross-checked against the database or wca.com.
 *
 * Usage: npm run explain -- Switzerland
 *        npm run explain -- CH
 */

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function fmtRef(ref: BestResult | null, eventId: string, kind: Kind): string {
  if (!ref) return "—";
  const v = formatResult(ref.value, eventId, kind);
  return `${v} by ${ref.personName} (${ref.personId}, ${countryName(ref.countryId)})`;
}

interface Line {
  label: string;
  kind: Kind;
  nr: BestResult | null;
  ref: BestResult | null;
  score: number;
}

function buildLines(
  events: EventData[],
  countryId: string,
  scope: "world" | "cont",
  continentId: string,
): Line[] {
  const lines: Line[] = [];
  for (const ed of events) {
    const sBest = ed.single?.countryBest.get(countryId);
    const aBest = ed.average?.countryBest.get(countryId);
    const sRef =
      scope === "world"
        ? ed.single?.worldRef ?? null
        : ed.single?.contRef.get(continentId) ?? null;
    const aRef =
      scope === "world"
        ? ed.average?.worldRef ?? null
        : ed.average?.contRef.get(continentId) ?? null;

    const sScore = sBest ? kinchScore(ed.event.id, sBest.value, sRef?.value ?? 0) : 0;
    const aScore = aBest ? kinchScore(ed.event.id, aBest.value, aRef?.value ?? 0) : 0;

    let kind: Kind;
    if (ed.event.type === "average") kind = "a";
    else if (ed.event.type === "best") kind = sScore >= aScore ? "s" : "a";
    else kind = "s";

    const nr = kind === "s" ? sBest ?? null : aBest ?? null;
    const ref = kind === "s" ? sRef : aRef;
    const score = kind === "s" ? sScore : aScore;

    const variant =
      ed.event.type === "best" ? (kind === "s" ? " (single)" : " (avg)") : "";
    lines.push({ label: ed.event.longName + variant, kind, nr, ref, score });
  }
  return lines;
}

function printScope(
  title: string,
  refName: string,
  lines: Line[],
  countryId: string,
): number {
  console.log(`\n=== ${title} ===\n`);
  console.log(
    pad("EVENT", 28) +
      pad(`NR (${countryName(countryId)})`, 16) +
      pad("NR HOLDER", 34) +
      pad(refName, 16) +
      pad(`${refName} HOLDER`, 44) +
      "SCORE",
  );
  let sum = 0;
  for (const l of lines) {
    sum += l.score;
    const nrStr = l.nr ? formatResult(l.nr.value, eventIdOf(l.label), l.kind) : "—";
    const nrHolder = l.nr ? `${l.nr.personName} (${l.nr.personId})` : "—";
    const refStr = l.ref
      ? formatResult(l.ref.value, eventIdOf(l.label), l.kind)
      : "—";
    const refHolder = l.ref
      ? `${l.ref.personName} (${l.ref.personId}, ${countryName(l.ref.countryId)})`
      : "—";
    console.log(
      pad(l.label, 28) +
        pad(nrStr, 16) +
        pad(nrHolder, 34) +
        pad(refStr, 16) +
        pad(refHolder, 44) +
        l.score.toFixed(2),
    );
  }
  const n = KINCH_EVENTS.length;
  console.log(
    `\nSum of scores: ${sum.toFixed(4)}  ÷ ${n} events  →  Kinch = ${(sum / n).toFixed(4)}`,
  );
  return sum / n;
}

// map back from the label (which may carry a variant suffix) to the event id
const labelToId = new Map<string, string>();
for (const e of KINCH_EVENTS) {
  labelToId.set(e.longName, e.id);
  labelToId.set(e.longName + " (single)", e.id);
  labelToId.set(e.longName + " (avg)", e.id);
}
function eventIdOf(label: string): string {
  return labelToId.get(label) ?? label;
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: npm run explain -- "Switzerland"');
    process.exit(1);
  }

  console.log(`Computing all Kinch ranks (same code path as the nightly job)…`);
  const { countries, events } = await computeAll();

  const wanted = countryCode(input) ?? input.toLowerCase();
  const country = countries.find(
    (c) =>
      countryCode(c.countryId) === wanted ||
      c.countryId.toLowerCase() === String(wanted).toLowerCase() ||
      countryName(c.countryId).toLowerCase() === input.toLowerCase(),
  );
  if (!country) {
    console.error(`Country "${input}" not found. Available examples:`);
    console.error(countries.slice(0, 10).map((c) => c.countryId).join(", "));
    process.exit(1);
  }

  const contName = continentName(country.continentId);
  console.log(
    `\n${countryName(country.countryId)} — continent: ${contName}` +
      `\nWorld rank: #${country.rankWorld}  ·  ${contName} rank: #${country.rankCont}`,
  );

  const worldLines = buildLines(events, country.countryId, "world", country.continentId);
  const kinchW = printScope(
    `All continents — reference: World Record`,
    "WR",
    worldLines,
    country.countryId,
  );

  const contLines = buildLines(events, country.countryId, "cont", country.continentId);
  const kinchC = printScope(
    `${contName} — reference: ${contName} Record`,
    "CR",
    contLines,
    country.countryId,
  );

  console.log(`\nStored values must match: kinch_score_world=${kinchW.toFixed(4)}, kinch_score_cont=${kinchC.toFixed(4)}`);
  console.log(
    `Check with: SELECT kinch_score_world, kinch_score_cont, rank_world, rank_continent FROM country_kinch_ranks WHERE country_id = '${country.countryId.replace(/'/g, "''")}';`,
  );

  await getPool().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
