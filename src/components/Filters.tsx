"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

interface Props {
  continents: { id: string; name: string }[];
  gender: "all" | "m" | "f";
  continentId: string | null;
}

const GENDERS: { id: "all" | "m" | "f"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "m", label: "Men" },
  { id: "f", label: "Women" },
];

export default function Filters({ continents, gender, continentId }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  function update(next: Partial<{ gender: string; continent: string | null }>) {
    const sp = new URLSearchParams(params.toString());
    if (next.gender !== undefined) {
      if (next.gender === "all") sp.delete("gender");
      else sp.set("gender", next.gender);
    }
    if (next.continent !== undefined) {
      if (!next.continent) sp.delete("continent");
      else sp.set("continent", next.continent);
    }
    startTransition(() => {
      router.replace(`/?${sp.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div
        role="tablist"
        className="inline-flex rounded-xl bg-white/5 p-1 ring-1 ring-white/10"
      >
        {GENDERS.map((g) => {
          const active = g.id === gender;
          return (
            <button
              key={g.id}
              role="tab"
              aria-selected={active}
              onClick={() => update({ gender: g.id })}
              className={[
                "px-4 py-2 text-sm font-medium rounded-lg transition",
                active
                  ? "bg-white text-neutral-900 shadow"
                  : "text-white/70 hover:text-white",
              ].join(" ")}
            >
              {g.label}
            </button>
          );
        })}
      </div>

      <label className="block">
        <span className="sr-only">Continent</span>
        <select
          value={continentId ?? ""}
          onChange={(e) => update({ continent: e.target.value || null })}
          className="w-full sm:w-56 rounded-xl bg-white/5 px-3 py-2 text-sm text-white ring-1 ring-white/10 outline-none focus:ring-white/30"
        >
          <option value="">All continents</option>
          {continents.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
