import KinchBoard from "@/components/KinchBoard";
import { fetchBoard, type BoardData } from "@/lib/queries";

/**
 * Static + revalidated every 10 minutes. All payload (board, refs, NR
 * holders) is embedded so filter / detail / what-if work without any
 * server roundtrip.
 */
export const revalidate = 600;

export default async function HomePage() {
  let data: BoardData | null = null;
  let error: string | null = null;
  try {
    data = await fetchBoard();
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    console.error("[country-kinch] load failed:", msg);
    if (/doesn't exist|Unknown table|Unknown column/i.test(msg)) {
      error =
        "The rankings table is missing or outdated. Run the GitHub Actions compute workflow.";
    } else if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|Handshake/i.test(msg)) {
      error =
        "Cannot reach the MySQL host. Check that external connections are allowed and MYSQL_HOST is correct.";
    } else if (/Access denied/i.test(msg)) {
      error = "MySQL credentials were rejected. Check MYSQL_USER / MYSQL_PASSWORD.";
    } else {
      error = msg;
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-2 pb-12 pt-4 sm:px-6 sm:pt-8">
      <header className="mb-3 px-1 sm:mb-5 sm:px-0">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-lg sm:text-2xl font-semibold tracking-tight">
            Country Kinch Ranks
          </h1>
          {(data?.wcaExportAt || data?.computedAt) && (
            <span
              className="shrink-0 text-right text-[11px] leading-tight text-white/40"
              title={
                data.wcaExportAt
                  ? `WCA export · ${new Date(data.wcaExportAt).toISOString()}`
                  : undefined
              }
            >
              {data.wcaExportAt ? (
                <>
                  <span className="block text-white/30">WCA export</span>
                  <span className="block tabular-nums">
                    {new Date(data.wcaExportAt).toLocaleString("en-CH", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </>
              ) : (
                new Date(data.computedAt!).toLocaleDateString("en-CH")
              )}
            </span>
          )}
        </div>
      </header>

      {error || !data ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5 text-sm">
          <div className="font-semibold text-amber-300">
            Rankings not available
          </div>
          <p className="mt-1 text-white/70">{error}</p>
        </div>
      ) : (
        <KinchBoard
          rows={data.rows}
          continents={data.continents}
          refs={data.refs}
        />
      )}

      <footer className="mt-6 text-center text-[11px] text-white/35">
        Source: WCA database · Inspired by{" "}
        <a
          href="https://wca.cuber.pro/kinch/countries"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-white/60"
        >
          wca.cuber.pro
        </a>
      </footer>
    </main>
  );
}
