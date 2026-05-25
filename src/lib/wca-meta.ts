/**
 * Country / continent metadata that is not present in the local database.
 * Continent names are a small fixed set; country names are resolved via the
 * built-in ICU mapping for ISO 3166-1 alpha-2 codes, with WCA-specific
 * overrides for "Multiple Countries" pseudo-entries.
 */

export const CONTINENT_NAMES: Record<string, string> = {
  _Africa: "Africa",
  _Asia: "Asia",
  _Europe: "Europe",
  "_North America": "North America",
  "_South America": "South America",
  _Oceania: "Oceania",
  "_Multiple Continents": "Multiple Continents",
};

export const PSEUDO_COUNTRIES = new Set<string>([
  "XA", // Multiple Countries (Africa)
  "XE", // Multiple Countries (Europe)
  "XS", // Multiple Countries (South America)
  "XN", // Multiple Countries (North America)
  "XO", // Multiple Countries (Oceania)
  "XW", // Multiple Countries (World)
  "XI", // Multiple Countries (Asia)
  "XM", // alternate Asia
]);

const COUNTRY_NAME_OVERRIDES: Record<string, string> = {
  XA: "Multiple Countries (Africa)",
  XE: "Multiple Countries (Europe)",
  XS: "Multiple Countries (South America)",
  XN: "Multiple Countries (North America)",
  XO: "Multiple Countries (Oceania)",
  XW: "Multiple Countries (World)",
  XI: "Multiple Countries (Asia)",
  XM: "Multiple Countries (Asia)",
  XK: "Kosovo",
};

let regionDisplay: Intl.DisplayNames | null = null;
function getRegionDisplay(): Intl.DisplayNames {
  if (!regionDisplay) {
    regionDisplay = new Intl.DisplayNames(["en"], { type: "region" });
  }
  return regionDisplay;
}

export function countryName(id: string): string {
  if (!id) return "";
  if (COUNTRY_NAME_OVERRIDES[id]) return COUNTRY_NAME_OVERRIDES[id];
  if (id.length === 2) {
    try {
      const n = getRegionDisplay().of(id);
      if (n && n !== id) return n;
    } catch {
      /* fall through */
    }
  }
  return id;
}

export function continentName(id: string): string {
  return CONTINENT_NAMES[id] ?? id;
}

export function isPseudoCountry(id: string): boolean {
  return PSEUDO_COUNTRIES.has(id);
}
