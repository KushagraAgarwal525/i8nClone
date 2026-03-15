import type { Metadata } from "next";
import type { EngineConfig } from "@/lib/types";
import { ComparisonTable } from "@/components/comparison-table";
import sampleEngines from "@/../data/sample-engines.json";
import Link from "next/link";

type SampleEngineEntry = {
  company: string;
  sourceLocale: string;
  targetLocale: string;
  engineConfig: EngineConfig;
};

export const metadata: Metadata = {
  title: "Engine Comparison — EngineClone",
  description:
    "See how Stripe, Linear, Vercel, and Notion each have unique translation engines with distinct brand voices, glossaries, and rules.",
};

export default function ComparePage() {
  const engines = sampleEngines.engines as unknown as SampleEngineEntry[];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f0f0f0]">
      <main className="max-w-5xl mx-auto px-4 py-16">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-4">
            <Link
              href="/"
              className="text-xs font-mono text-[#555] hover:text-[#888] transition-colors"
            >
              ← back
            </Link>
            <span className="text-[#333]">·</span>
            <span className="text-xs font-mono text-[#e8ff47]">compare</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-3">
            Translation Engines Compared
          </h1>
          <p className="text-[#888] text-lg leading-relaxed max-w-2xl">
            Every company has a unique voice. Here are the localization engines
            extracted from four of the most well-known developer tools — each
            with its own brand rules, glossary, and quality scorers.
          </p>
        </div>

        {/* Locale badge */}
        <div className="flex items-center gap-2 mb-8">
          <span className="text-xs font-mono text-[#555] uppercase tracking-widest">
            Locale pair
          </span>
          <span className="text-xs font-mono bg-[#e8ff4715] text-[#e8ff47] border border-[#e8ff4730] px-2 py-0.5">
            en → de
          </span>
          <span className="text-xs text-[#444]">· pre-generated</span>
        </div>

        {/* Table */}
        <div className="bg-[#0d0d0d] border border-[#1a1a1a] p-6 overflow-x-auto">
          <ComparisonTable engines={engines} />
        </div>

        {/* CTA */}
        <div className="mt-16 pt-10 border-t border-[#1a1a1a] flex items-center justify-between">
          <div>
            <p className="text-[#666] text-sm">
              Clone any translation engine from any website.
            </p>
          </div>
          <Link
            href="/"
            className="text-sm font-mono bg-[#e8ff47] text-[#0a0a0a] px-5 py-2.5 hover:bg-[#d4eb3a] transition-colors"
          >
            Clone your own →
          </Link>
        </div>
      </main>
    </div>
  );
}
