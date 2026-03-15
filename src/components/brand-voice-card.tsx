import type { ExtractionResult } from "@/lib/types";

interface Props {
  brandVoice: string;
  formality: string;
  tone: string;
}

export function BrandVoiceCard({ brandVoice, formality, tone }: Props) {
  return (
    <div className="bg-[#111] border border-[#222] p-6">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs font-mono text-[#666] uppercase tracking-widest">
          Brand Voice
        </span>
        {formality && (
          <span className="text-xs font-mono bg-[#e8ff4715] text-[#e8ff47] border border-[#e8ff4730] px-2 py-0.5">
            {formality}
          </span>
        )}
        {tone && (
          <span className="text-xs font-mono bg-[#47c8ff15] text-[#47c8ff] border border-[#47c8ff30] px-2 py-0.5">
            {tone}
          </span>
        )}
      </div>
      <p className="text-sm text-[#ccc] leading-relaxed">{brandVoice}</p>
    </div>
  );
}

