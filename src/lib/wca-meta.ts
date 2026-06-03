/**
 * Country / continent metadata that is not present in the local database.
 *
 * The WCA database stores countries either as ISO 3166-1 alpha-2 codes
 * ("CH") or as full English names ("Switzerland") depending on the import
 * source. The helpers below accept either form: they build a bidirectional
 * map between ISO codes and English country names via `Intl.DisplayNames`
 * (Node 20 / modern browsers) and then resolve the requested form.
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

const PSEUDO_COUNTRY_CODES = new Set<string>([
  "XA", "XE", "XS", "XN", "XO", "XW", "XI", "XM",
]);

const PSEUDO_COUNTRY_NAMES = new Set<string>([
  "Multiple Countries (Africa)",
  "Multiple Countries (Europe)",
  "Multiple Countries (South America)",
  "Multiple Countries (North America)",
  "Multiple Countries (Oceania)",
  "Multiple Countries (World)",
  "Multiple Countries (Asia)",
]);

/** Common WCA spellings that don't exactly match CLDR. Both sides are lowercased. */
const NAME_ALIASES: Record<string, string> = {
  "usa": "US",
  "united states": "US",
  "united states of america": "US",
  "uk": "GB",
  "united kingdom": "GB",
  "great britain": "GB",
  "czech republic": "CZ",
  "czechia": "CZ",
  "south korea": "KR",
  "korea, south": "KR",
  "korea (south)": "KR",
  "republic of korea": "KR",
  "north korea": "KP",
  "russia": "RU",
  "russian federation": "RU",
  "vietnam": "VN",
  "viet nam": "VN",
  "taiwan": "TW",
  "macau": "MO",
  "macao": "MO",
  "hong kong": "HK",
  "ivory coast": "CI",
  "cote d'ivoire": "CI",
  "côte d’ivoire": "CI",
  "côte d'ivoire": "CI",
  "iran": "IR",
  "syria": "SY",
  "laos": "LA",
  "moldova": "MD",
  "tanzania": "TZ",
  "venezuela": "VE",
  "bolivia": "BO",
  "brunei": "BN",
  "myanmar": "MM",
  "burma": "MM",
  "cape verde": "CV",
  "cabo verde": "CV",
  "east timor": "TL",
  "timor-leste": "TL",
  "swaziland": "SZ",
  "eswatini": "SZ",
  "kosovo": "XK",
  "palestine": "PS",
  "vatican city": "VA",
  "holy see": "VA",
  "north macedonia": "MK",
  "macedonia": "MK",
};

interface CountryMaps {
  codeToName: Map<string, string>;
  nameToCode: Map<string, string>;
}

let cached: CountryMaps | null = null;
function getMaps(): CountryMaps {
  if (cached) return cached;
  const codeToName = new Map<string, string>();
  const nameToCode = new Map<string, string>();
  let dn: Intl.DisplayNames | null = null;
  try {
    dn = new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    /* no ICU available */
  }
  if (dn) {
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        let name: string | undefined;
        try {
          name = dn.of(code);
        } catch {
          continue;
        }
        if (name && name !== code) {
          codeToName.set(code, name);
          nameToCode.set(name.toLowerCase(), code);
        }
      }
    }
  }
  for (const [k, v] of Object.entries(NAME_ALIASES)) nameToCode.set(k, v);
  cached = { codeToName, nameToCode };
  return cached;
}

/** Normalise any country identifier to an uppercase ISO 3166-1 alpha-2 code, or null. */
export function countryCode(id: string): string | null {
  if (!id) return null;
  if (/^[A-Za-z]{2}$/.test(id)) {
    const up = id.toUpperCase();
    if (PSEUDO_COUNTRY_CODES.has(up)) return null;
    return up;
  }
  const { nameToCode } = getMaps();
  const hit = nameToCode.get(id.toLowerCase());
  return hit ?? null;
}

export function countryName(id: string): string {
  if (!id) return "";
  if (/^[A-Za-z]{2}$/.test(id)) {
    const up = id.toUpperCase();
    if (PSEUDO_COUNTRY_CODES.has(up)) return id;
    const { codeToName } = getMaps();
    return codeToName.get(up) ?? id;
  }
  return id; // already a human-readable name
}

export function continentName(id: string): string {
  return CONTINENT_NAMES[id] ?? id;
}

export function isPseudoCountry(id: string): boolean {
  if (!id) return false;
  if (/^[A-Za-z]{2}$/.test(id) && PSEUDO_COUNTRY_CODES.has(id.toUpperCase())) {
    return true;
  }
  return PSEUDO_COUNTRY_NAMES.has(id);
}
