import Filters from "@/components/Filters";
import RankingTable from "@/components/RankingTable";
import {
  fetchRankings,
  lastComputedAt,
  listContinents,
  type Continent,
  type RankingRow,
} from "@/lib/queries";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = {
  continent?: string;
};

interface LoadResult {
  continents: Continent[];
  rows: RankingRow[];
  computedAt: Date | null;
  error: string | null;
}

async function loadAll(continentId: string | null): Promise<LoadResult> {
  try {
    const [continents, rows, computedAt] = await Promise.all([
      listContinents(),
      fetchRankings(continentId),
      lastComputedAt(),
    ]);
    return { continents, rows, computedAt, error: null };
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    console.error("[country-kinch] load failed:", msg);
    let hint = msg;
    if (/doesn't exist|Unknown table/i.test(msg)) {
      hint =
        "The country_kinch_ranks table does not exist yet. Run the GitHub Actions workflow to populate it.";
    } else if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|Handshake/i.test(msg)) {
      hint =
        "Cannot reach the MySQL host. Check that Hostpoint allows external connections and that MYSQL_HOST is correct.";
    } else if (/Access denied/i.test(msg)) {
      hint =
        "MySQL credentials were rejected. Check MYSQL_USER / MYSQL_PASSWORD on Vercel.";
    }
    return { continents: [], rows: [], computedAt: null, error: hint };
  }
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const continentId = searchParams.continent || null;
  const { continents, rows, computedAt, error } = await loadAll(continentId);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:pt-12">
      <header className="mb-6 sm:mb-8">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Country Kinch Ranks
          </h1>
          {computedAt && (
            <span className="text-xs text-white/40">
              {computedAt.toLocaleDateString()}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-white/60">
          Average of national-record Kinch scores across 18 events. Tap a row
          to see the per-event breakdown.
        </p>
      </header>

      {error ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5 text-sm">
          <div className="font-semibold text-amber-300">
            Rankings not available
          </div>
          <p className="mt-1 text-white/70">{error}</p>
        </div>
      ) : (
        <>
          <div className="mb-5">
            <Filters continents={continents} continentId={continentId} />
          </div>
          <RankingTable rows={rows} showContinentRank={!!continentId} />
        </>
      )}

      <footer className="mt-8 text-center text-xs text-white/40">
        Source: WCA database · Inspired by{" "}
        <a
          href="https://wca.cuber.pro/kinch/countries"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-white/70"
        >
          wca.cuber.pro
        </a>
      </footer>
    </main>
  );
}
