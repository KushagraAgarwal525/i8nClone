import type { Metadata } from "next";
import type { EngineConfig } from "@/lib/types";
import { ComparisonTable } from "@/components/comparison-table";
import atlassianConfig from "@/../benchmark/atlassian-engine-config.json";
import salesforceConfig from "@/../benchmark/salesforce-engine-config.json";
import shopifyConfig from "@/../benchmark/shopify-engine-config.json";
import stripeConfig from "@/../benchmark/stripe-engine-config.json";
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
  const engines: SampleEngineEntry[] = [
    {
      company: "Atlassian",
      sourceLocale: "en",
      targetLocale: "de",
      engineConfig: atlassianConfig as EngineConfig,
    },
    {
      company: "Salesforce",
      sourceLocale: "en",
      targetLocale: "de",
      engineConfig: salesforceConfig as EngineConfig,
    },
    {
      company: "Shopify",
      sourceLocale: "en",
      targetLocale: "de",
      engineConfig: shopifyConfig as EngineConfig,
    },
    {
      company: "Stripe",
      sourceLocale: "en",
      targetLocale: "de",
      engineConfig: stripeConfig as EngineConfig,
    },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f0f0f0] relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(71,200,255,0.08),transparent_34%),radial-gradient(circle_at_88%_0%,rgba(232,255,71,0.08),transparent_32%)]" />
      <main className="max-w-5xl mx-auto px-4 py-16">
        <div className="relative">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-xs font-mono border border-[#2b2b2b] bg-[#0d0d0d] px-3 py-2 text-[#9a9a9a] hover:text-[#f0f0f0] hover:border-[#4a4a4a] transition-colors"
            >
              <span aria-hidden>←</span>
              <span>Back to builder</span>
            </Link>
            <span className="text-xs font-mono text-[#e8ff47] border border-[#e8ff4730] bg-[#e8ff4715] px-2 py-1">compare</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-3">
            Translation Engines Compared
          </h1>
          <p className="text-[#888] text-lg leading-relaxed max-w-2xl">
            Real benchmark runs from Atlassian, Salesforce, Shopify, and Stripe
            using the current extraction pipeline. Each column is the actual
            generated engine config (brand voice, glossary, instructions, scorers).
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
        <div className="mt-16 pt-10 border-t border-[#1a1a1a] flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[#666] text-sm">
              Clone any translation engine from any website.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm font-mono border border-[#2b2b2b] bg-[#0d0d0d] text-[#a8a8a8] px-4 py-2.5 hover:text-[#f0f0f0] hover:border-[#4a4a4a] transition-colors"
            >
              ← Back
            </Link>
            <Link
              href="/"
              className="text-sm font-mono bg-[#e8ff47] text-[#0a0a0a] px-5 py-2.5 hover:bg-[#d4eb3a] transition-colors"
            >
              Clone your own →
            </Link>
          </div>
        </div>
        </div>
      </main>
    </div>
  );
}
