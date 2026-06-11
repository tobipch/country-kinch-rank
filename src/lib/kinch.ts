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

export interface EventScore {
  score: number;
  value: number;
  kind: Kind;
  /** NR holder + comp (set after enrichWithCompetitions). */
  holder: BestResult | null;
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

function defaultKind(event: KinchEvent): Kind {
  return event.type === "average" ? "a" : "s";
}

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
    return { score: a, value: aBest?.value ?? 0, kind: "a", holder: aBest ?? null };
  }
  if (ed.event.type === "best") {
    return s >= a
      ? { score: s, value: sBest?.value ?? 0, kind: "s", holder: sBest ?? null }
      : { score: a, value: aBest?.value ?? 0, kind: "a", holder: aBest ?? null };
  }
  return { score: s, value: sBest?.value ?? 0, kind: "s", holder: sBest ?? null };
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

/**
 * Enrich BestResult.comp by looking up the earliest competition where the
 * holder achieved that exact result. Only the NR/CR/WR holders we actually
 * care about are queried, so this stays fast even on the full WCA dump.
 */
async function enrichWithCompetitions(events: EventData[]): Promise<void> {
  const compRows = await query<{
    id: string;
    name: string;
    city_name: string | null;
    year: number;
    month: number;
    day: number;
  }>(
    "SELECT id, name, city_name, year, month, day FROM competitions",
  );
  const comps = new Map<string, CompInfo>();
  for (const c of compRows) {
    const date = `${c.year}-${String(c.month).padStart(2, "0")}-${String(c.day).padStart(2, "0")}`;
    comps.set(c.id, {
      id: c.id,
      name: c.name,
      date,
      city: c.city_name ?? "",
    });
  }

  // For each event, gather the holder set we need to enrich, then issue one
  // results query and look up each holder's earliest matching competition.
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
          world: { score: 0, value: 0, kind: defaultKind(e), holder: null },
          cont: { score: 0, value: 0, kind: defaultKind(e), holder: null },
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
