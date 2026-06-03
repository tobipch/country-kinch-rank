/**
 * Country / continent metadata.
 *
 * The WCA database stores countries either as ISO 3166-1 alpha-2 codes
 * ("CH") or as full English names ("Switzerland") depending on the import
 * source. The helpers below accept either form and resolve them against a
 * hardcoded WCA country list (normalised for accents, "&" vs "and",
 * apostrophes, whitespace).
 *
 * Hardcoding is deliberate: `Intl.DisplayNames` depends on the host's CLDR
 * version, which differs across browsers and produces inconsistent matches
 * (e.g. recent CLDR renames "Turkey" → "Türkiye").
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

const PSEUDO_COUNTRY_NAMES = new Set<string>(
  [
    "Multiple Countries (Africa)",
    "Multiple Countries (Europe)",
    "Multiple Countries (South America)",
    "Multiple Countries (North America)",
    "Multiple Countries (Oceania)",
    "Multiple Countries (World)",
    "Multiple Countries (Asia)",
  ].map(normalise),
);

/**
 * [ISO 3166-1 alpha-2, primary name, ...aliases]
 * Names cover both the canonical WCA spelling and common variations.
 */
const COUNTRIES: ReadonlyArray<readonly [string, string, ...string[]]> = [
  ["AD", "Andorra"],
  ["AE", "United Arab Emirates", "UAE"],
  ["AF", "Afghanistan"],
  ["AG", "Antigua and Barbuda"],
  ["AI", "Anguilla"],
  ["AL", "Albania"],
  ["AM", "Armenia"],
  ["AO", "Angola"],
  ["AR", "Argentina"],
  ["AT", "Austria"],
  ["AU", "Australia"],
  ["AZ", "Azerbaijan"],
  ["BA", "Bosnia and Herzegovina", "Bosnia & Herzegovina", "Bosnia"],
  ["BB", "Barbados"],
  ["BD", "Bangladesh"],
  ["BE", "Belgium"],
  ["BF", "Burkina Faso"],
  ["BG", "Bulgaria"],
  ["BH", "Bahrain"],
  ["BI", "Burundi"],
  ["BJ", "Benin"],
  ["BM", "Bermuda"],
  ["BN", "Brunei", "Brunei Darussalam"],
  ["BO", "Bolivia"],
  ["BR", "Brazil"],
  ["BS", "Bahamas"],
  ["BT", "Bhutan"],
  ["BW", "Botswana"],
  ["BY", "Belarus"],
  ["BZ", "Belize"],
  ["CA", "Canada"],
  ["CD", "Democratic Republic of the Congo", "DR Congo", "Congo-Kinshasa", "Congo (Kinshasa)"],
  ["CF", "Central African Republic"],
  ["CG", "Congo", "Republic of the Congo", "Congo-Brazzaville", "Congo (Brazzaville)"],
  ["CH", "Switzerland"],
  ["CI", "Côte d'Ivoire", "Cote d'Ivoire", "Ivory Coast"],
  ["CL", "Chile"],
  ["CM", "Cameroon"],
  ["CN", "China"],
  ["CO", "Colombia"],
  ["CR", "Costa Rica"],
  ["CU", "Cuba"],
  ["CV", "Cabo Verde", "Cape Verde"],
  ["CW", "Curaçao", "Curacao"],
  ["CY", "Cyprus"],
  ["CZ", "Czech Republic", "Czechia"],
  ["DE", "Germany"],
  ["DJ", "Djibouti"],
  ["DK", "Denmark"],
  ["DM", "Dominica"],
  ["DO", "Dominican Republic"],
  ["DZ", "Algeria"],
  ["EC", "Ecuador"],
  ["EE", "Estonia"],
  ["EG", "Egypt"],
  ["ER", "Eritrea"],
  ["ES", "Spain"],
  ["ET", "Ethiopia"],
  ["FI", "Finland"],
  ["FJ", "Fiji"],
  ["FO", "Faroe Islands"],
  ["FR", "France"],
  ["GA", "Gabon"],
  ["GB", "United Kingdom", "UK", "Great Britain", "Britain"],
  ["GD", "Grenada"],
  ["GE", "Georgia"],
  ["GF", "French Guiana"],
  ["GH", "Ghana"],
  ["GI", "Gibraltar"],
  ["GL", "Greenland"],
  ["GM", "Gambia"],
  ["GN", "Guinea"],
  ["GP", "Guadeloupe"],
  ["GQ", "Equatorial Guinea"],
  ["GR", "Greece"],
  ["GT", "Guatemala"],
  ["GW", "Guinea-Bissau"],
  ["GY", "Guyana"],
  ["HK", "Hong Kong", "Hong Kong, China"],
  ["HN", "Honduras"],
  ["HR", "Croatia"],
  ["HT", "Haiti"],
  ["HU", "Hungary"],
  ["ID", "Indonesia"],
  ["IE", "Ireland"],
  ["IL", "Israel"],
  ["IN", "India"],
  ["IQ", "Iraq"],
  ["IR", "Iran", "Iran, Islamic Republic of"],
  ["IS", "Iceland"],
  ["IT", "Italy"],
  ["JM", "Jamaica"],
  ["JO", "Jordan"],
  ["JP", "Japan"],
  ["KE", "Kenya"],
  ["KG", "Kyrgyzstan"],
  ["KH", "Cambodia"],
  ["KM", "Comoros"],
  ["KN", "Saint Kitts and Nevis"],
  ["KP", "North Korea", "Democratic People's Republic of Korea", "Korea, North"],
  ["KR", "Korea", "South Korea", "Republic of Korea", "Korea, South"],
  ["KW", "Kuwait"],
  ["KY", "Cayman Islands"],
  ["KZ", "Kazakhstan"],
  ["LA", "Laos", "Lao People's Democratic Republic"],
  ["LB", "Lebanon"],
  ["LC", "Saint Lucia"],
  ["LI", "Liechtenstein"],
  ["LK", "Sri Lanka"],
  ["LR", "Liberia"],
  ["LS", "Lesotho"],
  ["LT", "Lithuania"],
  ["LU", "Luxembourg"],
  ["LV", "Latvia"],
  ["LY", "Libya"],
  ["MA", "Morocco"],
  ["MC", "Monaco"],
  ["MD", "Moldova", "Republic of Moldova"],
  ["ME", "Montenegro"],
  ["MG", "Madagascar"],
  ["MK", "North Macedonia", "Macedonia"],
  ["ML", "Mali"],
  ["MM", "Myanmar", "Burma"],
  ["MN", "Mongolia"],
  ["MO", "Macau", "Macao", "Macau, China"],
  ["MQ", "Martinique"],
  ["MR", "Mauritania"],
  ["MT", "Malta"],
  ["MU", "Mauritius"],
  ["MV", "Maldives"],
  ["MW", "Malawi"],
  ["MX", "Mexico"],
  ["MY", "Malaysia"],
  ["MZ", "Mozambique"],
  ["NA", "Namibia"],
  ["NC", "New Caledonia"],
  ["NE", "Niger"],
  ["NG", "Nigeria"],
  ["NI", "Nicaragua"],
  ["NL", "Netherlands", "The Netherlands"],
  ["NO", "Norway"],
  ["NP", "Nepal"],
  ["NZ", "New Zealand"],
  ["OM", "Oman"],
  ["PA", "Panama"],
  ["PE", "Peru"],
  ["PG", "Papua New Guinea"],
  ["PH", "Philippines"],
  ["PK", "Pakistan"],
  ["PL", "Poland"],
  ["PR", "Puerto Rico"],
  ["PS", "Palestine", "State of Palestine"],
  ["PT", "Portugal"],
  ["PY", "Paraguay"],
  ["QA", "Qatar"],
  ["RO", "Romania"],
  ["RS", "Serbia"],
  ["RU", "Russia", "Russian Federation"],
  ["RW", "Rwanda"],
  ["SA", "Saudi Arabia"],
  ["SB", "Solomon Islands"],
  ["SC", "Seychelles"],
  ["SD", "Sudan"],
  ["SE", "Sweden"],
  ["SG", "Singapore"],
  ["SI", "Slovenia"],
  ["SK", "Slovakia"],
  ["SL", "Sierra Leone"],
  ["SM", "San Marino"],
  ["SN", "Senegal"],
  ["SO", "Somalia"],
  ["SR", "Suriname"],
  ["SS", "South Sudan"],
  ["ST", "São Tomé and Príncipe", "Sao Tome and Principe"],
  ["SV", "El Salvador"],
  ["SY", "Syria", "Syrian Arab Republic"],
  ["SZ", "Eswatini", "Swaziland"],
  ["TD", "Chad"],
  ["TG", "Togo"],
  ["TH", "Thailand"],
  ["TJ", "Tajikistan"],
  ["TL", "Timor-Leste", "East Timor"],
  ["TM", "Turkmenistan"],
  ["TN", "Tunisia"],
  ["TR", "Turkey", "Türkiye", "Turkiye"],
  ["TT", "Trinidad and Tobago"],
  ["TW", "Taiwan", "Chinese Taipei", "Taiwan, China"],
  ["TZ", "Tanzania", "United Republic of Tanzania"],
  ["UA", "Ukraine"],
  ["UG", "Uganda"],
  ["US", "United States", "USA", "United States of America", "America"],
  ["UY", "Uruguay"],
  ["UZ", "Uzbekistan"],
  ["VA", "Vatican City", "Holy See"],
  ["VC", "Saint Vincent and the Grenadines"],
  ["VE", "Venezuela", "Bolivarian Republic of Venezuela"],
  ["VN", "Vietnam", "Viet Nam"],
  ["XK", "Kosovo"],
  ["YE", "Yemen"],
  ["ZA", "South Africa"],
  ["ZM", "Zambia"],
  ["ZW", "Zimbabwe"],
];

/** Normalise a name for lookup: lowercase, strip accents, "&"→"and", remove punctuation. */
function normalise(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // combining marks (accents)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[‘’ʼ'`´]/g, "") // various apostrophes
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const CODE_TO_NAME = new Map<string, string>();
const NAME_TO_CODE = new Map<string, string>();
for (const entry of COUNTRIES) {
  const [code, primary, ...aliases] = entry;
  CODE_TO_NAME.set(code, primary);
  for (const n of [primary, ...aliases]) NAME_TO_CODE.set(normalise(n), code);
}

/** Normalise any country identifier to an uppercase ISO 3166-1 alpha-2 code, or null. */
export function countryCode(id: string): string | null {
  if (!id) return null;
  if (/^[A-Za-z]{2}$/.test(id)) {
    const up = id.toUpperCase();
    if (PSEUDO_COUNTRY_CODES.has(up)) return null;
    return CODE_TO_NAME.has(up) ? up : null;
  }
  return NAME_TO_CODE.get(normalise(id)) ?? null;
}

export function countryName(id: string): string {
  if (!id) return "";
  if (/^[A-Za-z]{2}$/.test(id)) {
    const up = id.toUpperCase();
    if (PSEUDO_COUNTRY_CODES.has(up)) return id;
    return CODE_TO_NAME.get(up) ?? id;
  }
  const code = NAME_TO_CODE.get(normalise(id));
  return code ? CODE_TO_NAME.get(code)! : id;
}

export function continentName(id: string): string {
  return CONTINENT_NAMES[id] ?? id;
}

export function isPseudoCountry(id: string): boolean {
  if (!id) return false;
  if (/^[A-Za-z]{2}$/.test(id) && PSEUDO_COUNTRY_CODES.has(id.toUpperCase())) {
    return true;
  }
  return PSEUDO_COUNTRY_NAMES.has(normalise(id));
}
