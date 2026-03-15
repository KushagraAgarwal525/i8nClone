import type { EngineConfig } from "@/lib/types";

interface Props {
  scorers: EngineConfig["scorers"];
}

export function ScorerBadges({ scorers }: Props) {
  if (!scorers.length) {
    return (
      <div className="text-sm text-[#444] font-mono py-4 text-center">
        No scorers generated
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {scorers.map((scorer, i) => (
        <div
          key={i}
          className="border border-[#222] bg-[#111] p-4 flex items-start gap-4"
        >
          <span
            className={`text-xs font-mono px-2 py-1 flex-shrink-0 ${
              scorer.type === "boolean"
                ? "bg-[#47c8ff15] text-[#47c8ff] border border-[#47c8ff30]"
                : "bg-[#4dff9115] text-[#4dff91] border border-[#4dff9130]"
            }`}
          >
            {scorer.type === "boolean" ? "✓ boolean" : "% percent"}
          </span>
          <div>
            <p className="text-sm font-medium text-[#f0f0f0]">{scorer.name}</p>
            <p className="text-xs text-[#666] mt-1">{scorer.instruction}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
