import type { EngineConfig, ExtractionResult, PreviewResult } from "@/lib/types";
import { BrandVoiceCard } from "./brand-voice-card";
import { GlossaryTable } from "./glossary-table";
import { InstructionsList } from "./instructions-list";
import { ScorerBadges } from "./scorer-badges";
import { TranslationPreview } from "./translation-preview";
import { DeployButton } from "./deploy-button";

interface Props {
  engineConfig: EngineConfig;
  extraction: ExtractionResult;
  preview: PreviewResult | null;
}

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="text-xs font-mono text-[#666] uppercase tracking-widest">
        {title}
      </span>
      {count !== undefined && (
        <span className="text-xs font-mono bg-[#1a1a1a] text-[#666] px-2 py-0.5">
          {count}
        </span>
      )}
      <div className="flex-1 h-px bg-[#1a1a1a]" />
    </div>
  );
}

export function EngineDisplay({ engineConfig, extraction, preview }: Props) {
  return (
    <div className="space-y-8">
      {/* Company header */}
      <div className="flex items-center gap-4">
        <h2 className="text-2xl font-bold tracking-tight">
          <span className="text-[#e8ff47]">{engineConfig.companyName}</span>
          <span className="text-[#444] mx-2">/</span>
          <span className="text-[#666] font-mono text-lg">
            {engineConfig.sourceLocale} → {engineConfig.targetLocale}
          </span>
        </h2>
        <div className="flex-1 h-px bg-[#1a1a1a]" />
        <span className="text-xs font-mono text-[#4dff91]">
          {engineConfig.glossaryItems.length} terms ·{" "}
          {engineConfig.instructions.length} rules ·{" "}
          {engineConfig.scorers.length} scorers
        </span>
      </div>

      {/* Brand Voice */}
      <div>
        <SectionHeader title="Brand Voice" />
        <BrandVoiceCard
          brandVoice={extraction.brandVoice}
          formality={extraction.formality}
          tone={extraction.tone}
        />
      </div>

      {/* Glossary */}
      <div>
        <SectionHeader
          title="Glossary"
          count={engineConfig.glossaryItems.length}
        />
        <div className="bg-[#111] border border-[#222] p-4">
          <GlossaryTable items={engineConfig.glossaryItems} />
        </div>
      </div>

      {/* Instructions */}
      <div>
        <SectionHeader
          title="Instructions"
          count={engineConfig.instructions.length}
        />
        <div className="bg-[#111] border border-[#222] p-6">
          <InstructionsList instructions={engineConfig.instructions} />
        </div>
      </div>

      {/* Scorers */}
      <div>
        <SectionHeader
          title="Quality Scorers"
          count={engineConfig.scorers.length}
        />
        <ScorerBadges scorers={engineConfig.scorers} />
      </div>

      {/* Translation Preview */}
      {preview && (
        <div>
          <SectionHeader title="Side-by-Side Preview" />
          <div className="border border-[#222]">
            <TranslationPreview preview={preview} />
          </div>
        </div>
      )}

      {/* Deploy */}
      <div className="pt-4 border-t border-[#1a1a1a]">
        <DeployButton engineConfig={engineConfig} />
      </div>
    </div>
  );
}
