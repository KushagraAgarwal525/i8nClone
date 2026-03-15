import { nvidiaChat } from "./nvidia";
import type { AlignedPair, ExtractionResult } from "./types";

const MAX_PAIRS = 15;
const MAX_PAIR_TEXT_CHARS = 280;

/** Deduplicate, quality-filter, and select the best pairs for style extraction. */
function preparePairs(pairs: AlignedPair[]): AlignedPair[] {
  const seen = new Set<string>();
  const candidates: AlignedPair[] = [];

  for (const p of pairs) {
    // Skip trivially short pairs — not useful for style analysis
    if (p.sourceText.length < 12 || p.targetText.length < 12) continue;
    // Skip identity pairs
    if (p.sourceText.toLowerCase() === p.targetText.toLowerCase()) continue;

    const key = `${p.sourceText.toLowerCase()}|||${p.targetText.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(p);
  }

  // Sort by quality: prefer longer, multi-word pairs (more style signal)
  candidates.sort((a, b) => {
    const aWords = a.sourceText.split(/\s+/).length + a.targetText.split(/\s+/).length;
    const bWords = b.sourceText.split(/\s+/).length + b.targetText.split(/\s+/).length;
    if (bWords !== aWords) return bWords - aWords;
    return (b.sourceText.length + b.targetText.length) - (a.sourceText.length + a.targetText.length);
  });

  return candidates.slice(0, MAX_PAIRS);
}

function formatPairs(pairs: AlignedPair[]): string {
  const compact = (text: string) => {
    const oneLine = text.replace(/\s+/g, " ").trim();
    if (oneLine.length <= MAX_PAIR_TEXT_CHARS) return oneLine;
    return `${oneLine.slice(0, MAX_PAIR_TEXT_CHARS - 1)}…`;
  };

  return pairs
    .map(
      (p, i) =>
        `${i + 1}. "${compact(p.sourceText)}" → "${compact(p.targetText)}"`,
    )
    .join("\n");
}

/**
 * Attempt to parse JSON from a string that may have surrounding noise.
 * Tries to extract the first JSON array or object found in the response.
 */
function safeParseJSON<T>(text: string, fallback: T): T {
  const cleaned = text?.trim() ?? "";
  // Try direct parse first
  try { return JSON.parse(cleaned); } catch { /* continue */ }
  // Try to extract a JSON array or object substring
  const match = cleaned.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch { /* continue */ }
  }
  return fallback;
}

/**
 * Algorithmically detect non-translatable terms by finding source words
 * that appear verbatim (unchanged) in the target text across multiple pairs.
 * This is more reliable than LLM-based detection for this task.
 */
function detectNonTranslatables(
  pairs: AlignedPair[]
): ExtractionResult["nonTranslatables"] {
  const freq = new Map<string, number>();

  for (const pair of pairs) {
    // Candidates: capitalized words (brand names) and all-caps acronyms
    const candidates =
      pair.sourceText.match(/\b([A-Z][a-zA-Z]{1,}|[A-Z]{2,})\b/g) ?? [];
    for (const c of candidates) {
      if (pair.targetText.includes(c)) {
        freq.set(c, (freq.get(c) ?? 0) + 1);
      }
    }
  }

  return Array.from(freq.entries())
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([term]) => ({
      term,
      reason: /^[A-Z]{2,}$/.test(term)
        ? "Technical acronym — kept in source language"
        : "Brand or product name — kept in source language",
    }));
}

type ExtractionPayload = {
  brandVoice?: string;
  formality?: string;
  tone?: string;
  customTranslations?: Array<{ sourceTerm?: string; targetTerm?: string; hint?: string }>;
  instructions?: Array<{ name?: string; text?: string }>;
  scorers?: Array<{ name?: string; instruction?: string; check?: string; type?: string }>;
};

const WEAK_RULE_PATTERNS = [
  /maintain quality/i,
  /be clear/i,
  /sound natural/i,
  /translate accurately/i,
  /keep meaning/i,
  /be concise/i,
];

function toKebabLabel(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40) || "style-rule";
}

function cleanSentence(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function normalizeInstructions(
  candidate: ExtractionPayload["instructions"],
): ExtractionResult["instructions"] {
  if (!Array.isArray(candidate)) return [];
  const seen = new Set<string>();
  const output: ExtractionResult["instructions"] = [];

  for (const item of candidate) {
    const text = cleanSentence(item?.text ?? "");
    if (!text || text.length < 24 || text.length > 220) continue;
    if (WEAK_RULE_PATTERNS.some((re) => re.test(text))) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    output.push({
      name: toKebabLabel(item?.name ?? text),
      text,
    });
  }

  return output.slice(0, 6);
}

function normalizeScorers(
  candidate: ExtractionPayload["scorers"],
): ExtractionResult["scorers"] {
  if (!Array.isArray(candidate)) return [];
  const seen = new Set<string>();
  const output: ExtractionResult["scorers"] = [];

  for (const item of candidate) {
    const name = cleanSentence(item?.name ?? "");
    const instruction = cleanSentence(item?.instruction ?? item?.check ?? "");
    if (!name || !instruction) continue;
    if (instruction.length < 30 || instruction.length > 260) continue;
    if (WEAK_RULE_PATTERNS.some((re) => re.test(instruction))) continue;

    const key = `${name.toLowerCase()}|||${instruction.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    output.push({
      name: toKebabLabel(name),
      instruction,
      type: item?.type === "percentage" ? "percentage" : "boolean",
    });
  }

  return output.slice(0, 4);
}

/**
 * Algorithmically build translation instructions from pairs + extracted metadata.
 * Used as fallback when the LLM returns pass-through for instruction extraction.
 */
function buildDefaultInstructions(
  pairs: AlignedPair[],
  formality: string,
  targetLocale: string,
  nonTranslatables: ExtractionResult["nonTranslatables"]
): ExtractionResult["instructions"] {
  const instructions: ExtractionResult["instructions"] = [];

  if (targetLocale.startsWith("de")) {
    const hasDu = pairs.some((p) =>
      /\b(du|dein|dich|dir|deine|deinen|deiner)\b/i.test(p.targetText)
    );
    const hasSie = pairs.some((p) => /\b(Sie|Ihnen|Ihr|Ihre)\b/.test(p.targetText));
    if (hasDu) {
      instructions.push({
        name: "informal-du-address",
        text: "Address users with the informal 'du' form (not 'Sie') consistently.",
      });
    } else if (hasSie || formality.toLowerCase().includes("formal")) {
      instructions.push({
        name: "formal-sie-address",
        text: "Address users formally using 'Sie' for all instructions and calls to action.",
      });
    }
  }

  const hasAiKi = pairs.some(
    (p) => p.sourceText.includes("AI") && p.targetText.includes("KI")
  );
  if (hasAiKi) {
    instructions.push({
      name: "ai-acronym",
      text: "Translate 'AI' as 'KI' consistently throughout.",
    });
  }

  if (nonTranslatables.length > 0) {
    const names = nonTranslatables
      .slice(0, 4)
      .map((n) => `'${n.term}'`)
      .join(", ");
    instructions.push({
      name: "preserve-brand-names",
      text: `Keep brand and product names untranslated: ${names}.`,
    });
  }

  if (targetLocale.startsWith("de")) {
    instructions.push({
      name: "idiomatic-german",
      text: "Use natural, idiomatic German phrasing rather than word-for-word translation.",
    });
  }

  if (formality.toLowerCase().includes("informal") || formality.toLowerCase().includes("casual")) {
    instructions.push({
      name: "conversational-tone",
      text: "Keep the tone approachable and conversational — avoid overly technical or bureaucratic language.",
    });
  }

  return instructions;
}

function buildDefaultBrandVoice(
  formality: string,
  tone: string,
  targetLocale: string,
  instructions: ExtractionResult["instructions"],
  nonTranslatables: ExtractionResult["nonTranslatables"]
): string {
  const normalizedFormality = formality && !/^unknown$/i.test(formality)
    ? formality
    : "neutral-professional";
  const normalizedTone = tone || "clear, concise, product-oriented";

  const guidance = instructions
    .slice(0, 2)
    .map((inst) => inst.text)
    .filter(Boolean)
    .join(" ");

  const preservedTerms = nonTranslatables
    .slice(0, 4)
    .map((item) => item.term)
    .filter(Boolean)
    .join(", ");

  const sentence4 = preservedTerms
    ? `Preserve established product terminology and non-translatable terms such as ${preservedTerms}.`
    : "Preserve established product terminology and keep lexical choices consistent across repeated interface patterns.";

  const sentence3 = guidance
    ? `Follow these style constraints consistently: ${guidance}`
    : "Prefer short, direct UI copy and avoid verbose or decorative phrasing that dilutes clarity.";

  return [
    `Write ${targetLocale} copy in a ${normalizedFormality} register with a ${normalizedTone} voice.`,
    "Keep messaging precise, technically trustworthy, and action-oriented for product UI and developer-facing text.",
    sentence3,
    sentence4,
  ].join(" ");
}

/**
 * Extract localization style from aligned translation pairs using NVIDIA-hosted LLMs.
 *
 * Non-translatables are detected algorithmically (reliable, instant).
 * Brand voice, formality/tone, custom translations, instructions, and scorers
 * are extracted in one JSON-shaped LLM call using a curated, compact pair sample.
 */
export async function extractStyle(
  pairs: AlignedPair[],
  sourceLocale: string,
  targetLocale: string
): Promise<ExtractionResult> {
  const sample = preparePairs(pairs);
  const pairsList = formatPairs(sample);
  const n = sample.length;
  const nonTranslatables = detectNonTranslatables(pairs);

  const systemPrompt =
    "You are a senior localization engineer. Return valid JSON only. No markdown, no prose outside JSON.";
  const userPrompt = `Analyze ${n} aligned translation pairs (${sourceLocale} -> ${targetLocale}).\n\nReturn EXACTLY one JSON object with this schema:\n{\n  "brandVoice": string,\n  "formality": string,\n  "tone": string,\n  "customTranslations": [{"sourceTerm": string, "targetTerm": string, "hint": string}],\n  "instructions": [{"name": string, "text": string}],\n  "scorers": [{"name": string, "instruction": string, "type": "boolean" | "percentage"}]\n}\n\nHard constraints:\n- brandVoice: 3-5 sentences, specific to this site voice.\n- formality: one short label (examples: \"informal-du\", \"formal-sie\", \"neutral-professional\").\n- tone: 2-5 adjectives/phrases (examples: \"concise, technical, direct\").\n- customTranslations: only domain/product terms with strong evidence from pairs.\n- instructions: 3-6 atomic and testable rules. Avoid generic advice.\n- scorers: 2-4 objective checks that a reviewer model can evaluate deterministically.\n\nInstruction quality bar:\n- Good: \"Use informal 'du' in all second-person imperatives.\"\n- Good: \"Keep product UI labels Dashboard, Connect, Radar untranslated.\"\n- Bad: \"Maintain quality and clarity.\"\n- Bad: \"Translate naturally.\"\n\nScorer quality bar:\n- Good: \"Check that all second-person pronouns are 'du/dein/dich', never 'Sie/Ihr'.\"\n- Good: \"Verify glossary terms appear exactly as specified for mapped source terms.\"\n- Bad: \"Score overall translation quality.\"\n\nIf uncertain, return empty arrays for that section instead of guessing.\n\nPAIRS:\n${pairsList}`;

  const rawResponse = await nvidiaChat(systemPrompt, userPrompt, {
    step: "extract-style",
    maxTokens: 2400,
    temperature: 0.2,
    topP: 0.7,
    retries: 2,
  });

  const parsed = safeParseJSON<ExtractionPayload>(rawResponse, {});
  const parsedBrandVoice = (parsed.brandVoice ?? "").trim();
  const formality = (parsed.formality ?? "unknown").trim() || "unknown";
  const tone = (parsed.tone ?? "").trim();

  const scorers = normalizeScorers(parsed.scorers);

  // Fallback: if LLM produced nothing, generate default scorers from extracted data
  const finalScorers =
    scorers.length > 0
      ? scorers
      : buildDefaultScorers(formality, tone, targetLocale);

  const rawInstructions = normalizeInstructions(parsed.instructions);

  const finalInstructions =
    rawInstructions.length > 0
      ? rawInstructions
      : buildDefaultInstructions(sample, formality, targetLocale, nonTranslatables);

  const brandVoice =
    parsedBrandVoice &&
    !/^unknown$/i.test(parsedBrandVoice) &&
    parsedBrandVoice.length >= 60
      ? parsedBrandVoice
      : buildDefaultBrandVoice(
          formality,
          tone,
          targetLocale,
          finalInstructions,
          nonTranslatables
        );

  return {
    brandVoice,
    formality,
    tone,
    nonTranslatables,
    customTranslations: (Array.isArray(parsed.customTranslations)
      ? parsed.customTranslations
          .filter((c) => c.sourceTerm && c.targetTerm)
          .map((c) => ({
            sourceTerm: c.sourceTerm!,
            targetTerm: c.targetTerm!,
            hint: c.hint ?? "",
          }))
      : []),
    instructions: finalInstructions,
    scorers: finalScorers,
  };
}

function buildDefaultScorers(
  formality: string,
  tone: string,
  targetLocale: string
): ExtractionResult["scorers"] {
  const scorers: ExtractionResult["scorers"] = [
    {
      name: "brand-voice-match",
      instruction: `Verify the translation reflects a ${tone || formality} tone consistent with the source brand voice.`,
      type: "boolean",
    },
  ];
  if (formality.toLowerCase().includes("formal")) {
    scorers.push({
      name: "formality-check",
      instruction: "Confirm formal register is maintained throughout (no informal contractions or casual phrasing).",
      type: "boolean",
    });
  }
  if (targetLocale.startsWith("de")) {
    scorers.push({
      name: "sie-form-check",
      instruction: "Verify all second-person references use the formal 'Sie' form, not 'du'.",
      type: "boolean",
    });
  }
  return scorers;
}
