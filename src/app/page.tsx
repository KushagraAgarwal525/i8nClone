"use client";

import { useState } from "react";
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
    <div className="min-h-screen bg-[#0a0a0a] text-[#f0f0f0]">
      <main className="max-w-3xl mx-auto px-4 py-16">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-mono text-[#666] uppercase tracking-widest">
              lingo.dev
            </span>
            <span className="text-[#333]">·</span>
            <span className="text-xs font-mono text-[#e8ff47]">
              engine clone
            </span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-3">
            Clone any translation engine
          </h1>
          <p className="text-[#888] text-lg leading-relaxed max-w-xl">
            Point at two URLs (source + translated), and get a custom
            localization engine that matches the brand voice, glossary, and
            rules of the original.
          </p>
        </div>

        {/* Input Form */}
        {(flowState === "idle" || flowState === "error") && (
          <section className="mb-10">
            <UrlInputForm
              disabled={false}
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
            <div className="mb-6">
              <span className="text-xs font-mono text-[#666] uppercase tracking-widest">
                Building engine for{" "}
                <span className="text-[#e8ff47]">{companyName}</span>
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
            <div className="flex items-center justify-between mb-8">
              <div>
                <span className="text-xs font-mono text-[#666] uppercase tracking-widest block mb-1">
                  engine ready
                </span>
                <h2 className="text-2xl font-bold">
                  {companyName} Translation Engine
                </h2>
              </div>
              <button
                onClick={() => setFlowState("idle")}
                className="text-xs font-mono text-[#444] hover:text-[#f0f0f0] underline"
              >
                Clone another →
              </button>
            </div>
            <EngineDisplay
              engineConfig={engineConfig}
              extraction={extraction}
              preview={preview}
            />
          </section>
        )}
      </main>
    </div>
  );
}
