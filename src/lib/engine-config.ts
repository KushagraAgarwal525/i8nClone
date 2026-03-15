import type { ExtractionResult, EngineConfig } from "./types";

function resolveBrandVoiceText(extraction: ExtractionResult, targetLocale: string): string {
  const candidate = extraction.brandVoice.trim();
  if (candidate && !/^unknown$/i.test(candidate)) {
    return candidate;
  }

  const formality = extraction.formality?.trim() || "neutral-professional";
  const tone = extraction.tone?.trim() || "clear, concise, product-oriented";

  return [
    `Use a ${formality} register for ${targetLocale} with a ${tone} tone.`,
    "Keep terminology stable, prefer short and direct UI phrasing, and avoid unnecessary stylistic variance.",
    "Preserve product names and technical terms as defined in glossary and instructions.",
  ].join(" ");
}

export function buildEngineConfig(
  extraction: ExtractionResult,
  sourceLocale: string,
  targetLocale: string,
  companyName: string
): EngineConfig {
  const glossaryItems: EngineConfig["glossaryItems"] = [
    ...extraction.nonTranslatables.map((nt) => ({
      sourceLocale,
      targetLocale,
      sourceText: nt.term,
      targetText: nt.term,
      type: "non_translatable" as const,
      hint: nt.reason,
    })),
    ...extraction.customTranslations.map((ct) => ({
      sourceLocale,
      targetLocale,
      sourceText: ct.sourceTerm,
      targetText: ct.targetTerm,
      type: "custom_translation" as const,
      hint: ct.hint,
    })),
  ];

  const instructionEntities: EngineConfig["instructions"] = extraction.instructions.map(
    (inst) => ({
      name: inst.name,
      targetLocale,
      text: inst.text,
    })
  );

  const scorerEntities: EngineConfig["scorers"] = extraction.scorers.map((s) => ({
    name: s.name,
    instruction: s.instruction,
    type: s.type,
    sourceLocale,
    targetLocale,
  }));

  return {
    sourceLocale,
    targetLocale,
    companyName,
    brandVoice: {
      targetLocale,
      text: resolveBrandVoiceText(extraction, targetLocale),
      formality: extraction.formality,
      tone: extraction.tone,
    },
    glossaryItems,
    instructions: instructionEntities,
    scorers: scorerEntities,
  };
}
