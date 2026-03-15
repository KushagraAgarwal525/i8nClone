import { NextRequest, NextResponse } from "next/server";
import { extractStyle } from "@/lib/extractor";
import { buildEngineConfig } from "@/lib/engine-config";
import { getSupabase } from "@/lib/supabase";
import type { ExtractRequest } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body: ExtractRequest = await req.json();
  const { alignedPairs, sourceLocale, targetLocale, companyName } = body;

  if (!alignedPairs?.length) {
    return NextResponse.json(
      { error: "No aligned pairs provided" },
      { status: 400 }
    );
  }

  // Run style extraction via Lingo.dev (single API call)
  const extraction = await extractStyle(alignedPairs, sourceLocale, targetLocale);

  // Build the engine config
  const engineConfig = buildEngineConfig(
    extraction,
    sourceLocale,
    targetLocale,
    companyName
  );

  // Track usage in Supabase (fire-and-forget)
  const supabase = getSupabase();
  if (supabase) {
    supabase.from("engine_runs").insert({
      source_url: `https://${companyName}.com`,
      source_locale: sourceLocale,
      target_locale: targetLocale,
      company_name: companyName,
      glossary_count: engineConfig.glossaryItems.length,
      instruction_count: engineConfig.instructions.length,
      non_translatable_count: extraction.nonTranslatables.length,
    }).then(() => {});
  }

  return NextResponse.json({ extraction, engineConfig });
}
