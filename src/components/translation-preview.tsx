import type { PreviewResult } from "@/lib/types";

interface Props {
  preview: PreviewResult;
}

const LABELS: Record<string, string> = {
  hero: "Hero",
  cta: "CTA",
  feature: "Feature",
  error: "Error",
  onboarding: "Onboarding",
};

export function TranslationPreview({ preview }: Props) {
  const { sampleStrings, genericTranslations, clonedTranslations } = preview;

  return (
    <div>
      <div className="grid grid-cols-[1fr_1fr] gap-px bg-[#222]">
        <div className="bg-[#111] px-4 py-3">
          <span className="text-xs font-mono text-[#666] uppercase tracking-widest">
            Generic Translation
          </span>
        </div>
        <div className="bg-[#111] px-4 py-3">
          <span className="text-xs font-mono text-[#4dff91] uppercase tracking-widest">
            Cloned Engine
          </span>
        </div>
      </div>

      {Object.keys(sampleStrings).map((key) => (
        <div key={key} className="border-b border-[#1a1a1a]">
          <div className="px-4 pt-3">
            <span className="text-xs font-mono text-[#333] uppercase tracking-wider">
              {LABELS[key] || key}
            </span>
            <p className="text-xs text-[#444] mt-1 mb-3 font-mono">
              {sampleStrings[key]}
            </p>
          </div>
          <div className="grid grid-cols-[1fr_1fr] gap-px bg-[#222]">
            <div className="bg-[#0d0d0d] px-4 py-3">
              <p className="text-sm text-[#888]">
                {genericTranslations[key] || "—"}
              </p>
            </div>
            <div className="bg-[#0d1a0d] px-4 py-3">
              <p className="text-sm text-[#d4ffdc]">
                {clonedTranslations[key] || "—"}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
