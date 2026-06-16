import { query } from "./db";
import { KINCH_EVENTS, KinchEvent } from "./events";
import { multiBldKinchScore } from "./multibld";
import { isPseudoCountry } from "./wca-meta";

/**
 * Core Kinch computation. Single source of truth used by both the nightly
 * compute job and the explain/verification script.
 */

export type Kind = "s" | "a";

export interface CompInfo {
  id: string;
  name: string;
  /** YYYY-MM-DD */
  date: string;
  city: string;
}

export interface BestResult {
  value: number;
  personId: string;
  personName: string;
  countryId: string;
  comp: CompInfo | null;
}

export interface EventSide {
  table: "ranks_single" | "ranks_average";
  worldRef: BestResult | null;
  contRef: Map<string, BestResult>;
  countryBest: Map<string, BestResult>;
}

export interface EventData {
  event: KinchEvent;
  single: EventSide | null;
  average: EventSide | null;
}

/** Score for one specific kind (single or average) of one country/event. */
export interface KindScore {
  score: number;
  value: number;
  holder: BestResult | null;
}

/**
 * Both kinds tracked separately. For "average" events only `a` is populated;
 * for "single"/"multibld" only `s`; for "best" events (3BLD, FM) both can
 * be populated and the Kinch score uses the better of the two.
 */
export interface EventScores {
  s: KindScore | null;
  a: KindScore | null;
}

export interface CountryKinch {
  countryId: string;
  continentId: string;
  kinchWorld: number;
  kinchCont: number;
  rankWorld: number;
  rankCont: number;
  events: Record<string, { world: EventScores; cont: EventScores }>;
}

export interface KinchComputation {
  countries: CountryKinch[];
  events: EventData[];
  continentByCountry: Map<string, string>;
}

export function kinchScore(eventId: string, value: number, ref: number): number {
  if (!value || value <= 0 || !ref || ref <= 0) return 0;
  if (eventId === "333mbf") {
    const s = multiBldKinchScore(value);
    const r = multiBldKinchScore(ref);
    return r > 0 ? (s / r) * 100 : 0;
  }
  return (ref / value) * 100;
}

export function eventNeedsSingle(e: KinchEvent): boolean {
  return e.type !== "average";
}
export function eventNeedsAverage(e: KinchEvent): boolean {
  return e.type === "average" || e.type === "best";
}

/** Best of single / average for one view, respecting the event's rules. */
export function bestKindScore(
  es: EventScores,
  e: KinchEvent,
): { kind: Kind; score: number; value: number; holder: BestResult | null } {
  if (e.type === "average") {
    return {
      kind: "a",
      score: es.a?.score ?? 0,
      value: es.a?.value ?? 0,
      holder: es.a?.holder ?? null,
    };
  }
  if (e.type === "single" || e.type === "multibld") {
    return {
      kind: "s",
      score: es.s?.score ?? 0,
      value: es.s?.value ?? 0,
      holder: es.s?.holder ?? null,
    };
  }
  // "best": pick the side with the higher score.
  const sS = es.s?.score ?? 0;
  const aS = es.a?.score ?? 0;
  if (sS >= aS) {
    return {
      kind: "s",
      score: sS,
      value: es.s?.value ?? 0,
      holder: es.s?.holder ?? null,
    };
  }
  return {
    kind: "a",
    score: aS,
    value: es.a?.value ?? 0,
    holder: es.a?.holder ?? null,
  };
}

interface PersonInfo {
  country: string;
  name: string;
}

async function loadPersons(): Promise<Map<string, PersonInfo>> {
  const rows = await query<{
    wca_id: string;
    sub_id: number;
    name: string;
    country_id: string | null;
  }>(
    `SELECT wca_id, sub_id, name, country_id
     FROM persons
     WHERE country_id IS NOT NULL
     ORDER BY wca_id, sub_id ASC`,
  );
  const m = new Map<string, PersonInfo>();
  for (const r of rows) {
    if (!m.has(r.wca_id) && r.country_id) {
      m.set(r.wca_id, { country: r.country_id, name: r.name });
    }
  }
  return m;
}

async function loadSide(
  table: "ranks_single" | "ranks_average",
  eventId: string,
  persons: Map<string, PersonInfo>,
  continentByCountry: Map<string, string>,
): Promise<EventSide> {
  const rows = await query<{ person_id: string; best: number }>(
    `SELECT person_id, best FROM ${table} WHERE event_id = ? AND best > 0`,
    [eventId],
  );

  let worldRef: BestResult | null = null;
  const countryBest = new Map<string, BestResult>();
  for (const r of rows) {
    const p = persons.get(r.person_id);
    const countryId = p?.country ?? "";
    const br: BestResult = {
      value: r.best,
      personId: r.person_id,
      personName: p?.name ?? r.person_id,
      countryId,
      comp: null,
    };
    if (!worldRef || r.best < worldRef.value) worldRef = br;
    if (!p || isPseudoCountry(countryId)) continue;
    const cur = countryBest.get(countryId);
    if (!cur || r.best < cur.value) countryBest.set(countryId, br);
  }

  const contRef = new Map<string, BestResult>();
  for (const br of countryBest.values()) {
    const cont = continentByCountry.get(br.countryId);
    if (!cont) continue;
    const cur = contRef.get(cont);
    if (!cur || br.value < cur.value) contRef.set(cont, br);
  }

  return { table, worldRef, contRef, countryBest };
}

function assignRanks(
  list: CountryKinch[],
  key: (c: CountryKinch) => number,
  set: (c: CountryKinch, rank: number) => void,
): void {
  const sorted = [...list].sort(
    (x, y) => key(y) - key(x) || x.countryId.localeCompare(y.countryId),
  );
  let prev = NaN;
  let prevRank = 0;
  sorted.forEach((c, i) => {
    const v = Number(key(c).toFixed(4));
    const rank = v === prev ? prevRank : i + 1;
    set(c, rank);
    prev = v;
    prevRank = rank;
  });
}

async function tableColumns(table: string): Promise<Set<string>> {
  const rows = await query<{ col: string }>(
    `SELECT COLUMN_NAME AS col
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [table],
  );
  return new Set(rows.map((r) => r.col.toLowerCase()));
}

async function enrichWithCompetitions(events: EventData[]): Promise<void> {
  const compCols = await tableColumns("competitions");
  const resultCols = await tableColumns("results");

  const resultsNeeded = ["person_id", "event_id", "competition_id", "best", "average"];
  const missingResults = resultsNeeded.filter((c) => !resultCols.has(c));
  if (!compCols.has("id") || !compCols.has("name") || missingResults.length > 0) {
    console.warn(
      `Skipping competition enrichment (competitions has id/name: ${compCols.has("id") && compCols.has("name")}, ` +
        `results missing: ${missingResults.join(",") || "none"})`,
    );
    return;
  }

  const cityCol = compCols.has("city_name")
    ? "city_name"
    : compCols.has("city")
      ? "city"
      : null;
  const hasStartDate = compCols.has("start_date");
  const hasYmd =
    compCols.has("year") && compCols.has("month") && compCols.has("day");

  const selectParts = ["id", "name"];
  if (cityCol) selectParts.push(`${cityCol} AS city`);
  if (hasStartDate) selectParts.push("start_date");
  else if (hasYmd) selectParts.push("year", "month", "day");

  const compRows = await query<any>(
    `SELECT ${selectParts.join(", ")} FROM competitions`,
  );
  const comps = new Map<string, CompInfo>();
  for (const c of compRows) {
    let date = "";
    if (hasStartDate && c.start_date) {
      date = new Date(c.start_date).toISOString().slice(0, 10);
    } else if (hasYmd && c.year) {
      date = `${c.year}-${String(c.month).padStart(2, "0")}-${String(c.day).padStart(2, "0")}`;
    }
    comps.set(c.id, {
      id: c.id,
      name: c.name,
      date,
      city: c.city ?? "",
    });
  }

  await Promise.all(
    events.map(async (ed) => {
      const enrichSide = async (side: EventSide | null, kind: Kind) => {
        if (!side) return;
        const holders = new Map<string, BestResult[]>();
        const addHolder = (br: BestResult | null) => {
          if (!br) return;
          if (!holders.has(br.personId)) holders.set(br.personId, []);
          holders.get(br.personId)!.push(br);
        };
        addHolder(side.worldRef);
        for (const br of side.contRef.values()) addHolder(br);
        for (const br of side.countryBest.values()) addHolder(br);
        if (holders.size === 0) return;

        const personIds = Array.from(holders.keys());
        const placeholders = personIds.map(() => "?").join(",");
        const valueCol = kind === "s" ? "best" : "average";
        const rows = await query<{
          person_id: string;
          val: number;
          competition_id: string;
        }>(
          `SELECT person_id, ${valueCol} AS val, competition_id
           FROM results
           WHERE event_id = ? AND ${valueCol} > 0 AND person_id IN (${placeholders})`,
          [ed.event.id, ...personIds],
        );
        const byPerson = new Map<string, { val: number; comp: CompInfo }[]>();
        for (const r of rows) {
          const comp = comps.get(r.competition_id);
          if (!comp) continue;
          if (!byPerson.has(r.person_id)) byPerson.set(r.person_id, []);
          byPerson.get(r.person_id)!.push({ val: r.val, comp });
        }
        for (const [personId, holderList] of holders) {
          const candidates = byPerson.get(personId) ?? [];
          for (const br of holderList) {
            const matches = candidates.filter((c) => c.val === br.value);
            if (matches.length === 0) continue;
            matches.sort((a, b) => a.comp.date.localeCompare(b.comp.date));
            br.comp = matches[0].comp;
          }
        }
      };

      await Promise.all([
        enrichSide(ed.single, "s"),
        enrichSide(ed.average, "a"),
      ]);
    }),
  );
}

export async function computeAll(): Promise<KinchComputation> {
  const countryRows = await query<{ id: string; continent_id: string }>(
    "SELECT id, continent_id FROM countries WHERE continent_id IS NOT NULL",
  );
  const continentByCountry = new Map(
    countryRows.map((c) => [c.id, c.continent_id]),
  );

  const persons = await loadPersons();

  const events: EventData[] = await Promise.all(
    KINCH_EVENTS.map(async (event) => {
      const needSingle = eventNeedsSingle(event);
      const needAverage = eventNeedsAverage(event);
      const [single, average] = await Promise.all([
        needSingle
          ? loadSide("ranks_single", event.id, persons, continentByCountry)
          : Promise.resolve(null),
        needAverage
          ? loadSide("ranks_average", event.id, persons, continentByCountry)
          : Promise.resolve(null),
      ]);
      return { event, single, average };
    }),
  );

  await enrichWithCompetitions(events);

  const byCountry = new Map<string, CountryKinch>();
  const ensure = (cid: string): CountryKinch | null => {
    const cont = continentByCountry.get(cid);
    if (!cont || isPseudoCountry(cid)) return null;
    let c = byCountry.get(cid);
    if (!c) {
      c = {
        countryId: cid,
        continentId: cont,
        kinchWorld: 0,
        kinchCont: 0,
        rankWorld: 0,
        rankCont: 0,
        events: {},
      };
      byCountry.set(cid, c);
    }
    return c;
  };

  for (const ed of events) {
    const ids = new Set<string>([
      ...(ed.single?.countryBest.keys() ?? []),
      ...(ed.average?.countryBest.keys() ?? []),
    ]);
    for (const cid of ids) {
      const c = ensure(cid);
      if (!c) continue;
      const sBest = ed.single?.countryBest.get(cid);
      const aBest = ed.average?.countryBest.get(cid);
      const sWorldRef = ed.single?.worldRef?.value ?? 0;
      const aWorldRef = ed.average?.worldRef?.value ?? 0;
      const sContRef = ed.single?.contRef.get(c.continentId)?.value ?? 0;
      const aContRef = ed.average?.contRef.get(c.continentId)?.value ?? 0;

      c.events[ed.event.id] = {
        world: {
          s: sBest
            ? {
                score: kinchScore(ed.event.id, sBest.value, sWorldRef),
                value: sBest.value,
                holder: sBest,
              }
            : null,
          a: aBest
            ? {
                score: kinchScore(ed.event.id, aBest.value, aWorldRef),
                value: aBest.value,
                holder: aBest,
              }
            : null,
        },
        cont: {
          s: sBest
            ? {
                score: kinchScore(ed.event.id, sBest.value, sContRef),
                value: sBest.value,
                holder: sBest,
              }
            : null,
          a: aBest
            ? {
                score: kinchScore(ed.event.id, aBest.value, aContRef),
                value: aBest.value,
                holder: aBest,
              }
            : null,
        },
      };
    }
  }

  const n = KINCH_EVENTS.length;
  for (const c of byCountry.values()) {
    let sumW = 0;
    let sumC = 0;
    for (const e of KINCH_EVENTS) {
      let slot = c.events[e.id];
      if (!slot) {
        slot = { world: { s: null, a: null }, cont: { s: null, a: null } };
        c.events[e.id] = slot;
      }
      sumW += bestKindScore(slot.world, e).score;
      sumC += bestKindScore(slot.cont, e).score;
    }
    c.kinchWorld = sumW / n;
    c.kinchCont = sumC / n;
  }

  const countries = Array.from(byCountry.values()).filter(
    (c) => c.kinchWorld > 0 || c.kinchCont > 0,
  );

  assignRanks(countries, (c) => c.kinchWorld, (c, r) => (c.rankWorld = r));
  const byCont = new Map<string, CountryKinch[]>();
  for (const c of countries) {
    if (!byCont.has(c.continentId)) byCont.set(c.continentId, []);
    byCont.get(c.continentId)!.push(c);
  }
  for (const list of byCont.values()) {
    assignRanks(list, (c) => c.kinchCont, (c, r) => (c.rankCont = r));
  }

  return { countries, events, continentByCountry };
}
