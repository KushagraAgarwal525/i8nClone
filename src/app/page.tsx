﻿"use client";

import { useState } from "react";
import Link from "next/link";
import { UrlInputForm } from "@/components/url-input-form";
import { ExtractionStepper } from "@/components/extraction-stepper";
import { EngineDisplay } from "@/components/engine-display";
import type {
  EngineConfig,
  ExtractionResult,
  PreviewResult,
  AlignedPair,
} from "@/lib/types";

type FlowState =
  | "idle"
  | "crawling"
  | "extracting"
  | "previewing"
  | "done"
  | "error";

type StepStatus = "pending" | "active" | "done" | "error";

const STEPS = [
  { id: "crawl", label: "Crawling both URLs" },
  { id: "align", label: "Aligning content pairs" },
  { id: "extract", label: "Extracting localization style" },
  { id: "preview", label: "Generating translation preview" },
];

const RUNNING_STATES: FlowState[] = ["crawling", "extracting", "previewing"];

function parseManualPairs(text: string): AlignedPair[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("|"))
    .map((line, i) => {
      const parts = line.split("|");
      const source = parts[0]?.trim() ?? "";
      const target = parts[1]?.trim() ?? "";
      return {
        sourcePath: `manual-${i}`,
        sourceText: source,
        targetText: target,
        tag: "p",
      };
    })
    .filter((p) => p.sourceText && p.targetText);
}

export default function HomePage() {
  const [flowState, setFlowState] = useState<FlowState>("idle");
  const [stepStatuses, setStepStatuses] = useState<Record<string, StepStatus>>(
    {}
  );
  const [stepDetails, setStepDetails] = useState<Record<string, string>>({});
  const [engineConfig, setEngineConfig] = useState<EngineConfig | null>(null);
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("your brand");

  const isRunning = RUNNING_STATES.includes(flowState);
  const doneSteps = Object.values(stepStatuses).filter((s) => s === "done").length;
  const totalSteps = STEPS.length;

  function setStep(id: string, status: StepStatus, detail?: string) {
    setStepStatuses((prev) => ({ ...prev, [id]: status }));
    if (detail) setStepDetails((prev) => ({ ...prev, [id]: detail }));
  }

  async function runPipeline(data: {
    sourceUrl: string;
    targetUrl: string;
    sourceLocale: string;
    targetLocale: string;
    companyName: string;
    pairs?: AlignedPair[];
  }) {
    setCompanyName(data.companyName);
    setError(null);
    setEngineConfig(null);
    setExtraction(null);
    setPreview(null);
    setStepStatuses({
      crawl: "pending",
      align: "pending",
      extract: "pending",
      preview: "pending",
    });
    setStepDetails({});

    let pairs: AlignedPair[] = data.pairs ?? [];

    try {
      // Step 1: Crawl (skip if manual pairs provided)
      if (!data.pairs) {
        setFlowState("crawling");
        setStep("crawl", "active");

        const crawlRes = await fetch("/api/crawl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceUrl: data.sourceUrl,
            targetUrl: data.targetUrl,
            sourceLocale: data.sourceLocale,
            targetLocale: data.targetLocale,
          }),
        });

        if (!crawlRes.ok) {
          const err = await crawlRes.json().catch(() => ({}));
          throw new Error(err.error ?? `Crawl failed (${crawlRes.status})`);
        }

        const crawlData = await crawlRes.json();
        pairs = crawlData.alignedPairs;
        setStep("crawl", "done", `${crawlData.sourceNodes?.length ?? 0} nodes found`);
        setStep("align", "done", `${pairs.length} pairs aligned`);
      } else {
        setStep("crawl", "done", "manual pairs");
        setStep("align", "done", `${pairs.length} pairs`);
      }

      // Step 2: Extract
      setFlowState("extracting");
      setStep("extract", "active");

      const extractRes = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alignedPairs: pairs,
          sourceLocale: data.sourceLocale,
          targetLocale: data.targetLocale,
          companyName: data.companyName,
        }),
      });

      if (!extractRes.ok) {
        const err = await extractRes.json().catch(() => ({}));
        throw new Error(err.error ?? `Extract failed (${extractRes.status})`);
      }

      const extractData = await extractRes.json();
      setExtraction(extractData.extraction);
      setEngineConfig(extractData.engineConfig);
      setStep(
        "extract",
        "done",
        `${extractData.engineConfig.glossaryItems?.length ?? 0} glossary terms`
      );

      // Step 3: Preview
      setFlowState("previewing");
      setStep("preview", "active");

      const previewRes = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engineConfig: extractData.engineConfig,
          targetLocale: data.targetLocale,
        }),
      });

      if (!previewRes.ok) {
        const err = await previewRes.json().catch(() => ({}));
        throw new Error(
          err.error ?? `Preview failed (${previewRes.status})`
        );
      }

      const previewData = await previewRes.json();
      setPreview(previewData);
      setStep("preview", "done", `${previewData.samples?.length ?? 0} samples`);

      setFlowState("done");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      setFlowState("error");
      // Mark any active step as error
      setStepStatuses((prev) => {
        const updated = { ...prev };
        for (const key of Object.keys(updated)) {
          if (updated[key] === "active") updated[key] = "error";
        }
        return updated;
      });
    }
  }

  const stepsWithDetails = STEPS.map((s) => ({
    ...s,
    detail: stepDetails[s.id],
  }));

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f0f0f0] relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(232,255,71,0.09),transparent_35%),radial-gradient(circle_at_85%_20%,rgba(71,200,255,0.07),transparent_30%)]" />
      <main className="max-w-3xl mx-auto px-4 py-16">
        <div className="relative">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-[#666] uppercase tracking-widest">
                lingo.dev
              </span>
              <span className="text-[#333]">·</span>
              <span className="text-xs font-mono text-[#e8ff47]">
                engine clone
              </span>
            </div>
            <Link
              href="/compare"
              className="text-xs font-mono border border-[#2b2b2b] px-3 py-1.5 text-[#9a9a9a] hover:text-[#f0f0f0] hover:border-[#4a4a4a] transition-colors"
            >
              View benchmark engines →
            </Link>
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-3">
            Clone any translation engine
          </h1>
          <p className="text-[#888] text-lg leading-relaxed max-w-xl">
            Point at two URLs (source + translated), and get a custom
            localization engine that matches the brand voice, glossary, and
            rules of the original.
          </p>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="text-xs font-mono text-[#7a7a7a] border border-[#1f1f1f] bg-[#0d0d0d] px-3 py-2">crawl + align web copy</div>
            <div className="text-xs font-mono text-[#7a7a7a] border border-[#1f1f1f] bg-[#0d0d0d] px-3 py-2">extract voice + glossary + rules</div>
            <div className="text-xs font-mono text-[#7a7a7a] border border-[#1f1f1f] bg-[#0d0d0d] px-3 py-2">preview + deploy to lingo</div>
          </div>
        </div>

        {/* Input Form */}
        {(flowState === "idle" || flowState === "error") && (
          <section className="mb-10">
            <UrlInputForm
              disabled={isRunning}
              onSubmit={(d) => runPipeline(d)}
              onManualSubmit={(d) => {
                const pairs = parseManualPairs(d.pairsText);
                runPipeline({
                  sourceUrl: "",
                  targetUrl: "",
                  sourceLocale: d.sourceLocale,
                  targetLocale: d.targetLocale,
                  companyName: d.companyName,
                  pairs,
                });
              }}
            />
            {flowState === "error" && error && (
              <div className="mt-4 p-4 border border-[#ff6b3530] bg-[#ff6b3510] text-[#ff6b35] text-sm font-mono">
                Error: {error}
              </div>
            )}
          </section>
        )}

        {/* Stepper */}
        {(flowState === "crawling" ||
          flowState === "extracting" ||
          flowState === "previewing") && (
          <section className="mb-10">
            <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
              <span className="text-xs font-mono text-[#666] uppercase tracking-widest">
                Building engine for{" "}
                <span className="text-[#e8ff47]">{companyName}</span>
              </span>
              <span className="text-xs font-mono text-[#777] border border-[#2b2b2b] bg-[#0d0d0d] px-2.5 py-1">
                {doneSteps}/{totalSteps} complete
              </span>
            </div>
            <ExtractionStepper
              steps={stepsWithDetails}
              statuses={stepStatuses}
            />
          </section>
        )}

        {/* Results */}
        {flowState === "done" && engineConfig && extraction && (
          <section>
            <div className="flex items-center justify-between mb-8 gap-3 flex-wrap">
              <div>
                <span className="text-xs font-mono text-[#666] uppercase tracking-widest block mb-1">
                  engine ready
                </span>
                <h2 className="text-2xl font-bold">
                  {companyName} Translation Engine
                </h2>
              </div>
              <button
                onClick={() => {
                  setFlowState("idle");
                  setEngineConfig(null);
                  setExtraction(null);
                  setPreview(null);
                  setError(null);
                }}
                className="text-xs font-mono border border-[#2b2b2b] bg-[#0d0d0d] px-3 py-2 text-[#8a8a8a] hover:text-[#f0f0f0] hover:border-[#4a4a4a] transition-colors"
              >
                ← Start new clone
              </button>
            </div>
            <EngineDisplay
              engineConfig={engineConfig}
              extraction={extraction}
              preview={preview}
            />
          </section>
        )}
        </div>
      </main>
    </div>
  );
}
