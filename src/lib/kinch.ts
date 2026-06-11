import { query } from "./db";
import { KINCH_EVENTS, KinchEvent } from "./events";
import { multiBldKinchScore } from "./multibld";
import { isPseudoCountry } from "./wca-meta";

/**
 * Core Kinch computation, shared by the nightly compute script and the
 * explain/verification script so both always agree.
 *
 * Definitions:
 *  - For each event, a country's score is REF / NR × 100 where NR is the
 *    national record (best result by a person *currently* representing the
 *    country) and REF is the world record (all-continents view) or the
 *    continental record (continent view).
 *  - Multi-BLD results are decoded to points + (3600 − seconds) / 3600 and
 *    the ratio of those decoded scores is used (more points always wins).
 *  - 3BLD and FM use single or average, whichever yields the better score —
 *    chosen independently for the world view and the continent view.
 *  - Missing events score 0. The final Kinch score is the plain average
 *    over all KINCH_EVENTS.
 */

export type Kind = "s" | "a";

export interface BestResult {
  value: number;
  personId: string;
  personName: string;
  countryId: string;
}

export interface EventSide {
  table: "ranks_single" | "ranks_average";
  /** Best result worldwide (the reference for the all-continents view). */
  worldRef: BestResult | null;
  /** Best result per continent (the reference for the continent view). */
  contRef: Map<string, BestResult>;
  /** Best result per country (the NR). */
  countryBest: Map<string, BestResult>;
}

export interface EventData {
  event: KinchEvent;
  single: EventSide | null;
  average: EventSide | null;
}

export interface EventScore {
  score: number;
  value: number;
  kind: Kind;
}

export interface CountryKinch {
  countryId: string;
  continentId: string;
  kinchWorld: number;
  kinchCont: number;
  rankWorld: number;
  rankCont: number;
  events: Record<string, { world: EventScore; cont: EventScore }>;
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

interface PersonInfo {
  country: string;
  name: string;
}

/**
 * wca_id → current country + name. The row with the smallest sub_id per
 * person is the current entry (older country assignments live on higher
 * sub_ids), so this works for 0- and 1-based importers alike.
 */
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

function defaultKind(event: KinchEvent): Kind {
  return event.type === "average" ? "a" : "s";
}

/**
 * Pick the scoring variant for one country/event/reference-scope.
 * For "best" events the better of single and average is chosen
 * independently per scope.
 */
function pick(
  ed: EventData,
  sBest: BestResult | undefined,
  aBest: BestResult | undefined,
  sRef: number,
  aRef: number,
): EventScore {
  const s = sBest ? kinchScore(ed.event.id, sBest.value, sRef) : 0;
  const a = aBest ? kinchScore(ed.event.id, aBest.value, aRef) : 0;
  if (ed.event.type === "average") {
    return { score: a, value: aBest?.value ?? 0, kind: "a" };
  }
  if (ed.event.type === "best") {
    return s >= a
      ? { score: s, value: sBest?.value ?? 0, kind: "s" }
      : { score: a, value: aBest?.value ?? 0, kind: "a" };
  }
  return { score: s, value: sBest?.value ?? 0, kind: "s" };
}

/** Competition ranking: equal scores share a rank (1, 2, 2, 4). */
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
      const needSingle = event.type !== "average";
      const needAverage = event.type === "average" || event.type === "best";
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
      const world = pick(
        ed,
        sBest,
        aBest,
        ed.single?.worldRef?.value ?? 0,
        ed.average?.worldRef?.value ?? 0,
      );
      const cont = pick(
        ed,
        sBest,
        aBest,
        ed.single?.contRef.get(c.continentId)?.value ?? 0,
        ed.average?.contRef.get(c.continentId)?.value ?? 0,
      );
      c.events[ed.event.id] = { world, cont };
    }
  }

  const n = KINCH_EVENTS.length;
  for (const c of byCountry.values()) {
    let sumW = 0;
    let sumC = 0;
    for (const e of KINCH_EVENTS) {
      let slot = c.events[e.id];
      if (!slot) {
        slot = {
          world: { score: 0, value: 0, kind: defaultKind(e) },
          cont: { score: 0, value: 0, kind: defaultKind(e) },
        };
        c.events[e.id] = slot;
      }
      sumW += slot.world.score;
      sumC += slot.cont.score;
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
