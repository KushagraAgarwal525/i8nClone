import { NextRequest, NextResponse } from "next/server";
import { getLingo } from "@/lib/lingo";
import { nvidiaChat } from "@/lib/nvidia";
import type { PreviewRequest, PreviewResult, EngineConfig } from "@/lib/types";

// Standard SaaS strings that showcase style differences well
const SAMPLE_STRINGS: Record<string, string> = {
  hero: "Deploy your application to production in seconds.",
  cta: "Get started with our developer tools today.",
  feature: "Manage your team's workspace and permissions from the dashboard.",
  error: "Something went wrong. Please try again or contact support.",
  onboarding: "Welcome! Let's set up your account and configure your first project.",
};

function buildInlineInstruction(config: EngineConfig): string {
  const parts: string[] = [];
  parts.push(`STYLE RULES: ${config.brandVoice.text}`);

  if (config.glossaryItems.length > 0) {
    const glossary = config.glossaryItems
      .map((g) =>
        g.type === "non_translatable"
          ? `Keep "${g.sourceText}" untranslated`
          : `Translate "${g.sourceText}" as "${g.targetText}"`
      )
      .join("; ");
    parts.push(`GLOSSARY: ${glossary}`);
  }

  if (config.instructions.length > 0) {
    const rules = config.instructions.map((i) => i.text).join("; ");
    parts.push(`RULES: ${rules}`);
  }

  return parts.join("\n");
}

function safeParseJSON<T>(text: string, fallback: T): T {
  const cleaned = text?.trim() ?? "";
  try { return JSON.parse(cleaned); } catch { /* continue */ }
  const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (match) {
    try { return JSON.parse(match[0]); } catch { /* continue */ }
  }
  return fallback;
}

async function retryCall<T>(
  fn: () => Promise<T>,
  step: string,
  maxRetries = 2,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (attempt >= maxRetries) throw new Error(`Preview step '${step}' failed: ${msg}`);
      const transient = /(500|503|429|timeout|temporar|overload|rate limit)/i.test(msg);
      if (!transient) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

async function translateWithNvidia(
  input: Record<string, string>,
  sourceLocale: string,
  targetLocale: string,
  inlineRules?: string,
): Promise<Record<string, string>> {
  const payload = JSON.stringify(input, null, 2);
  const system = "You are a professional localization engine. Return strict JSON only.";
  const user = inlineRules
    ? `Translate JSON values from ${sourceLocale} to ${targetLocale} using the style rules below. Keep the same keys. Return ONLY a JSON object where each key maps to translated text.\n\nSTYLE RULES:\n${inlineRules}\n\nINPUT JSON:\n${payload}`
    : `Translate JSON values from ${sourceLocale} to ${targetLocale}. Keep the same keys. Return ONLY a JSON object where each key maps to translated text.\n\nINPUT JSON:\n${payload}`;

  const raw = await nvidiaChat(system, user, {
    step: inlineRules ? "preview-cloned" : "preview-generic-fallback",
    maxTokens: 1800,
    temperature: 0.2,
    topP: 0.7,
    retries: 2,
  });

  return safeParseJSON<Record<string, string>>(raw, {});
}

export async function POST(req: NextRequest) {
  const body: PreviewRequest = await req.json();
  const { engineConfig } = body;

  // Generic baseline translation: prefer Lingo.dev, fallback to NVIDIA if Lingo is unavailable.
  const lingo = getLingo();
  let genericTranslations: Record<string, string>;
  try {
    genericTranslations = await retryCall(
      () =>
        lingo.localizeObject(SAMPLE_STRINGS, {
          sourceLocale: engineConfig.sourceLocale,
          targetLocale: engineConfig.targetLocale,
        }),
      "generic-lingo",
      2,
    );
  } catch {
    genericTranslations = await translateWithNvidia(
      SAMPLE_STRINGS,
      engineConfig.sourceLocale,
      engineConfig.targetLocale,
    );
  }

  // Cloned translation always uses NVIDIA to avoid en->en prompt pass-through/500 issues on Lingo.
  const inlineRules = buildInlineInstruction(engineConfig);
  const clonedTranslations = await translateWithNvidia(
    SAMPLE_STRINGS,
    engineConfig.sourceLocale,
    engineConfig.targetLocale,
    inlineRules,
  );

  const result: PreviewResult = {
    sampleStrings: SAMPLE_STRINGS,
    genericTranslations,
    clonedTranslations,
  };

  return NextResponse.json(result);
}
