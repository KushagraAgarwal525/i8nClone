import { nvidiaChat } from "./nvidia";
import type { AlignedPair, ExtractionResult } from "./types";

const MAX_PAIRS = 22;
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
    return `${oneLine.slice(0, MAX_PAIR_TEXT_CHARS - 1)}...`;
  };

  return pairs
    .map((p, i) => `${i + 1}. "${compact(p.sourceText)}" -> "${compact(p.targetText)}"`)
    .join("\n");
}

/**
 * Attempt to parse JSON from a string that may have surrounding noise.
 * Tries to extract the first JSON array or object found in the response.
 */
function safeParseJSON<T>(text: string, fallback: T): T {
  const cleaned = text?.trim() ?? "";
  // Try direct parse first
  try {
    return JSON.parse(cleaned);
  } catch {
    // continue
  }

  // Try to extract a JSON array or object substring
  const match = cleaned.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      // continue
    }
  }
  return fallback;
}

/**
 * Algorithmically detect non-translatable terms by finding source words
 * that appear verbatim (unchanged) in the target text across multiple pairs.
 * This is more reliable than LLM-based detection for this task.
 */
function detectNonTranslatables(pairs: AlignedPair[]): ExtractionResult["nonTranslatables"] {
  const freq = new Map<string, number>();

  for (const pair of pairs) {
    // Candidates: capitalized words (brand names) and all-caps acronyms
    const candidates = pair.sourceText.match(/\b([A-Z][a-zA-Z]{1,}|[A-Z]{2,})\b/g) ?? [];
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
        ? "Technical acronym - kept in source language"
        : "Brand or product name - kept in source language",
    }));
}

type ExtractionPayload = {
  brandVoice?: unknown;
  formality?: unknown;
  tone?: unknown;
  customTranslations?: Array<{ sourceTerm?: unknown; targetTerm?: unknown; hint?: unknown }>;
  instructions?: Array<{ name?: unknown; text?: unknown }>;
  scorers?: Array<{ name?: unknown; instruction?: unknown; check?: unknown; type?: unknown }>;
};

function toSafeText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item : ""))
      .filter(Boolean)
      .join(", ")
      .trim();
  }
  if (value && typeof value === "object") {
    const text = (value as { text?: unknown }).text;
    if (typeof text === "string") return text.trim();
  }
  return "";
}

const WEAK_RULE_PATTERNS = [
  /maintain quality/i,
  /be clear/i,
  /sound natural/i,
  /translate accurately/i,
  /keep meaning/i,
  /be concise/i,
  /translate naturally/i,
  /high-quality and clear writing/i,
];

const PROMPT_LEAK_PATTERNS = [
  /du\/dein\/dich/i,
  /sie\/ihr/i,
  /dashboard,?\s*connect,?\s*radar/i,
  /glossary terms appear exactly as specified/i,
  /second-person pronouns/i,
  /use informal '?du'?/i,
  /keep product ui labels/i,
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

function inferFormalityFromPairs(pairs: AlignedPair[]): string {
  let duHits = 0;
  let sieHits = 0;

  for (const pair of pairs) {
    if (/\b(du|dein|dich|dir|deine|deinen|deiner)\b/i.test(pair.targetText)) duHits += 1;
    if (/\b(Sie|Ihnen|Ihr|Ihre|Ihrem|Ihren)\b/.test(pair.targetText)) sieHits += 1;
  }

  if (duHits >= 2 && duHits > sieHits) return "informal-du";
  if (sieHits >= 2 && sieHits > duHits) return "formal-sie";
  return "";
}

function inferToneFromPairs(pairs: AlignedPair[]): string {
  let technicalSignals = 0;
  let friendlySignals = 0;

  for (const pair of pairs) {
    const text = `${pair.sourceText} ${pair.targetText}`.toLowerCase();
    if (/\b(api|sdk|webhook|oauth|token|endpoint|cli|dashboard|integration|auth)\b/.test(text)) {
      technicalSignals += 1;
    }
    if (/\b(welcome|hello|let's|together|easily|simple|friendly|help)\b/.test(text)) {
      friendlySignals += 1;
    }
  }

  if (technicalSignals >= Math.max(3, friendlySignals + 1)) return "technical, direct";
  if (friendlySignals >= Math.max(3, technicalSignals + 1)) return "friendly, approachable";
  return "";
}

function normalizeFormalityLabel(raw: string, pairs: AlignedPair[]): string {
  const value = raw.trim();
  if (!value || /^unknown$/i.test(value) || /^neutral-?professional$/i.test(value)) {
    return inferFormalityFromPairs(pairs);
  }
  return value;
}

function normalizeToneLabel(raw: string, pairs: AlignedPair[]): string {
  const value = raw.trim();
  if (!value) return inferToneFromPairs(pairs);

  // This common anchor phrase is treated as low-confidence and replaced with inferred tone.
  if (/^concise,? technical,? direct$/i.test(value)) {
    return inferToneFromPairs(pairs);
  }

  return value;
}

function normalizeInstructions(candidate: ExtractionPayload["instructions"]): ExtractionResult["instructions"] {
  if (!Array.isArray(candidate)) return [];
  const seen = new Set<string>();
  const output: ExtractionResult["instructions"] = [];

  for (const item of candidate) {
    const text = cleanSentence(toSafeText(item?.text));
    if (!text || text.length < 24 || text.length > 220) continue;
    if (WEAK_RULE_PATTERNS.some((re) => re.test(text))) continue;
    if (PROMPT_LEAK_PATTERNS.some((re) => re.test(text))) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    output.push({
      name: toKebabLabel(toSafeText(item?.name) || text),
      text,
    });
  }

  return output.slice(0, 6);
}

function normalizeScorers(candidate: ExtractionPayload["scorers"]): ExtractionResult["scorers"] {
  if (!Array.isArray(candidate)) return [];
  const seen = new Set<string>();
  const output: ExtractionResult["scorers"] = [];

  for (const item of candidate) {
    const name = cleanSentence(toSafeText(item?.name));
    const instruction = cleanSentence(toSafeText(item?.instruction) || toSafeText(item?.check));
    if (!name || !instruction) continue;
    if (instruction.length < 30 || instruction.length > 260) continue;
    if (WEAK_RULE_PATTERNS.some((re) => re.test(instruction))) continue;
    if (PROMPT_LEAK_PATTERNS.some((re) => re.test(instruction))) continue;
    if (PROMPT_LEAK_PATTERNS.some((re) => re.test(name))) continue;

    const key = `${name.toLowerCase()}|||${instruction.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    output.push({
      name: toKebabLabel(name),
      instruction,
      type: toSafeText(item?.type).toLowerCase() === "percentage" ? "percentage" : "boolean",
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

  const hasAiKi = pairs.some((p) => p.sourceText.includes("AI") && p.targetText.includes("KI"));
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
      text: "Keep the tone approachable and conversational - avoid overly technical or bureaucratic language.",
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

function tokenizeForOverlap(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4);
}

function overlapRatio(a: string, b: string): number {
  const aTokens = new Set(tokenizeForOverlap(a));
  const bTokens = new Set(tokenizeForOverlap(b));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection += 1;
  }

  return intersection / Math.min(aTokens.size, bTokens.size);
}

function isAnnouncementLike(text: string): boolean {
  return /(partnership|announce|announcement|press release|today we|launch(ed)? with|new partnership|collaboration|joint|partnerschaft|ankuendig|bekanntgabe|wir freuen uns|pressemitteilung)/i.test(
    text
  );
}

function isCaseStudyNarrative(text: string): boolean {
  const hasQuotedSpeech = /["'“”„][^"'“”„]{20,}["'“”„]/.test(text);
  const hasAttribution = /(director|ceo|founder|head of|vp|manager|erklaert|erklärt|sagt|sagte|laut|according to)/i.test(
    text
  );
  const hasStorySignals =
    /(\bals\b|\bwhen\b|\bafter\b|\bwhile\b).{0,60}(expand|expansion|launch|partnerschaft|collaboration|zusammenarbeit|international)/i.test(
      text
    ) ||
    /(years? (of )?expansion|sechs oder sieben jahre|suchte man|ermoeglicht es kunden|ermöglicht es kunden)/i.test(
      text
    );

  // Reject promotional narratives that cite people/events instead of style guidance.
  return [hasQuotedSpeech, hasAttribution, hasStorySignals].filter(Boolean).length >= 2;
}

function isTooCloseToAnyTarget(candidate: string, pairs: AlignedPair[]): boolean {
  const normalizedCandidate = candidate.toLowerCase().replace(/\s+/g, " ").trim();

  for (const pair of pairs) {
    const target = pair.targetText.toLowerCase().replace(/\s+/g, " ").trim();
    if (target.length < 45) continue;

    // Direct substring copying of long target sentence.
    if (normalizedCandidate.includes(target) || target.includes(normalizedCandidate)) {
      return true;
    }

    // High lexical overlap indicates paraphrase/copy instead of style abstraction.
    if (overlapRatio(candidate, pair.targetText) >= 0.66) {
      return true;
    }
  }

  return false;
}

function isStrongBrandVoice(candidate: string, samplePairs?: AlignedPair[]): boolean {
  const text = candidate.trim();
  if (!text || /^unknown$/i.test(text) || text.length < 120) return false;

  const sentenceCount = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean).length;

  if (sentenceCount < 3) return false;
  if (/\b(as an ai|cannot provide|generic style|neutral style)\b/i.test(text)) {
    return false;
  }
  if (isAnnouncementLike(text)) return false;
  if (isCaseStudyNarrative(text)) return false;
  if (samplePairs && isTooCloseToAnyTarget(text, samplePairs)) return false;

  return true;
}

async function generateBrandVoiceParagraph(params: {
  sourceLocale: string;
  targetLocale: string;
  samplePairs: AlignedPair[];
  pairsList: string;
  formality: string;
  tone: string;
  instructions: ExtractionResult["instructions"];
  nonTranslatables: ExtractionResult["nonTranslatables"];
}): Promise<string | null> {
  const {
    sourceLocale,
    targetLocale,
    samplePairs,
    pairsList,
    formality,
    tone,
    instructions,
    nonTranslatables,
  } = params;

  const instructionHints = instructions
    .slice(0, 4)
    .map((inst) => `- ${inst.text}`)
    .join("\n");

  const lockedTerms = nonTranslatables
    .slice(0, 6)
    .map((term) => term.term)
    .join(", ");

  const bannedSnippets = samplePairs
    .map((p) => p.targetText.trim())
    .filter((text) => text.length >= 45)
    .slice(0, 4)
    .map((text) => `- "${text.replace(/\s+/g, " ").slice(0, 140)}"`)
    .join("\n");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const prompt = [
      `You are writing a localization brand voice paragraph for ${targetLocale}.`,
      `Input pairs are ${sourceLocale} -> ${targetLocale}.`,
      "Output format: return only plain text paragraph (no JSON, no bullets).",
      "Requirements:",
      "- 4 sentences.",
      "- 130-260 characters per sentence.",
      "- Mention register/formality and tone explicitly.",
      "- Include concrete behavioral guidance for UI/marketing translation choices.",
      "- Must be evergreen style guidance, not topic/news summary.",
      "- Do NOT mention partnerships, announcements, launches, or specific events.",
      "- Do NOT mention named people, job titles, customer stories, timelines, or quotes.",
      "- Do NOT copy or paraphrase any specific sentence from the pairs.",
      `- Formality hint: ${formality || "unknown"}`,
      `- Tone hint: ${tone || "unknown"}`,
      lockedTerms ? `- Preserve terms like: ${lockedTerms}.` : "",
      instructionHints ? `- Instruction hints:\n${instructionHints}` : "",
      bannedSnippets ? `- Never reuse snippets like:\n${bannedSnippets}` : "",
      attempt > 0 ? "- Previous draft was too close to source text. Abstract style only." : "",
      "\nPAIRS:\n",
      pairsList,
    ]
      .filter(Boolean)
      .join("\n");

    const response = await nvidiaChat(
      "You are an expert localization strategist. Return only the requested paragraph.",
      prompt,
      {
        step: "extract-brand-voice",
        maxTokens: 1100,
        temperature: attempt === 0 ? 0.25 : 0.35,
        topP: 0.8,
        retries: 2,
      }
    );

    const text = response.replace(/^\"|\"$/g, "").trim();
    if (isStrongBrandVoice(text, samplePairs)) {
      return text;
    }
  }

  return null;
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
  const nonTranslatables = detectNonTranslatables(sample);

  const systemPrompt =
    "You are a senior localization engineer. Return valid JSON only. No markdown, no prose outside JSON.";
  const userPrompt = `Analyze ${n} aligned translation pairs (${sourceLocale} -> ${targetLocale}).\n\nReturn EXACTLY one JSON object with this schema:\n{\n  "brandVoice": string,\n  "formality": string,\n  "tone": string,\n  "customTranslations": [{"sourceTerm": string, "targetTerm": string, "hint": string}],\n  "instructions": [{"name": string, "text": string}],\n  "scorers": [{"name": string, "instruction": string, "type": "boolean" | "percentage"}]\n}\n\nHard constraints:\n- brandVoice: REQUIRED. 4 sentences, highly specific to this site voice, no generic wording, minimum 120 characters total.\n- formality: one short label derived from evidence in the pairs.\n- tone: 2-5 adjectives/phrases derived from evidence in the pairs.\n- customTranslations: only domain/product terms with strong evidence from pairs.\n- instructions: 3-6 atomic and testable rules. Avoid generic advice.\n- scorers: 2-4 objective checks that a reviewer model can evaluate deterministically.\n\nInstruction quality bar:\n- Good: site-specific rule grounded in recurring UI or product copy patterns.\n- Bad: generic writing advice without concrete site behavior.\n\nScorer quality bar:\n- Good: measurable check tied to glossary consistency, terminology, or register consistency observed in pairs.\n- Bad: generic "quality" scoring rubric.\n\nDo NOT copy any literal example phrasing from this prompt. Build rules only from the provided pairs.\nIf uncertain for optional sections, return empty arrays. brandVoice should still be provided.\n\nPAIRS:\n${pairsList}`;

  const rawResponse = await nvidiaChat(systemPrompt, userPrompt, {
    step: "extract-style",
    maxTokens: 2800,
    temperature: 0.2,
    topP: 0.7,
    retries: 2,
  });

  const parsed = safeParseJSON<ExtractionPayload>(rawResponse, {});
  const parsedBrandVoice = toSafeText(parsed.brandVoice);
  const formality = normalizeFormalityLabel(toSafeText(parsed.formality) || "unknown", sample);
  const tone = normalizeToneLabel(toSafeText(parsed.tone), sample);

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

  let brandVoice = isStrongBrandVoice(parsedBrandVoice, sample) ? parsedBrandVoice : "";

  if (!brandVoice) {
    const generatedBrandVoice = await generateBrandVoiceParagraph({
      sourceLocale,
      targetLocale,
      samplePairs: sample,
      pairsList,
      formality,
      tone,
      instructions: finalInstructions,
      nonTranslatables,
    }).catch(() => null);

    if (generatedBrandVoice) {
      brandVoice = generatedBrandVoice;
    }
  }

  if (!brandVoice) {
    brandVoice = buildDefaultBrandVoice(
      formality,
      tone,
      targetLocale,
      finalInstructions,
      nonTranslatables
    );
  }

  return {
    brandVoice,
    formality,
    tone,
    nonTranslatables,
    customTranslations: Array.isArray(parsed.customTranslations)
      ? parsed.customTranslations
          .map((c) => ({
            sourceTerm: toSafeText(c.sourceTerm),
            targetTerm: toSafeText(c.targetTerm),
            hint: toSafeText(c.hint),
          }))
          .filter((c) => c.sourceTerm && c.targetTerm)
          .map((c) => ({
            sourceTerm: c.sourceTerm,
            targetTerm: c.targetTerm,
            hint: c.hint,
          }))
      : [],
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
