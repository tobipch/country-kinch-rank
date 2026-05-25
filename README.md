# Country Kinch Ranks

Kinch ranks for countries (national records) using a WCA database on Hostpoint.
Mobile-first Next.js app with filters by continent and gender.

## What is a Kinch rank?

For each of 18 events, the score is `WR / NR * 100`:

- **Averages**: 3×3, 4×4, 5×5, 2×2, OH, Feet, Megaminx, Pyraminx, Square-1,
  Clock, Skewb, 6×6, 7×7
- **Singles**: 4BLD, 5BLD, Multi-BLD
- **Best of single or average**: 3BLD, FM

For Multi-BLD: `points + (3600 − time_in_seconds) / 3600`.
The country's Kinch score is the average of the 18 event scores.

## Setup

```bash
cp .env.example .env       # fill in MYSQL_PASSWORD
npm install
npm run init-db            # creates `country_kinch_ranks` once
npm run compute            # builds the precomputed table (re-run to refresh)
npm run dev                # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

## Refresh schedule

`npm run compute` recomputes everything in a single transaction and is safe to
run on a cron (e.g. nightly). Typical run reads the `Persons`, `Countries`,
`Continents`, `RanksSingle`, `RanksAverage` tables and writes one row per
`(country, gender)`.

## Filters

- **Gender**: `all`, `m`, `f` — the denominator (WR) is the best result among
  the filtered population, so the score still spans 0–100 within each filter.
- **Continent**: server-side filter on the precomputed table.
