import { NextRequest, NextResponse } from "next/server";
import { crawlMultiPage } from "@/lib/crawler";
import { alignPairs } from "@/lib/aligner";
import { getLingo } from "@/lib/lingo";
import type { CrawlRequest, CrawlResult, AlignedPair } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body: CrawlRequest = await req.json();
  const { sourceUrl, targetUrl, sourceLocale, targetLocale } = body;

  // Validate URLs
  let parsedSource: URL, parsedTarget: URL;
  try {
    parsedSource = new URL(sourceUrl);
    parsedTarget = new URL(targetUrl);
  } catch {
    return NextResponse.json(
      { error: "Invalid URL format" },
      { status: 400 }
    );
  }

  // Only allow http/https (prevent SSRF via other protocols)
  if (!["http:", "https:"].includes(parsedSource.protocol) ||
      !["http:", "https:"].includes(parsedTarget.protocol)) {
    return NextResponse.json(
      { error: "Only HTTP/HTTPS URLs are allowed" },
      { status: 400 }
    );
  }

  // Block private/internal IP ranges to prevent SSRF
  const blockedHosts = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
  if (blockedHosts.test(parsedSource.hostname) || blockedHosts.test(parsedTarget.hostname)) {
    return NextResponse.json(
      { error: "Private/internal URLs are not allowed" },
      { status: 400 }
    );
  }

  // Multi-page crawl: main pages + up to 3 extra page pairs
  const { mainSource, mainTarget, extraPages } = await crawlMultiPage(
    sourceUrl,
    targetUrl,
  );

  // Align each page pair independently to avoid cross-page misalignment
  const mainPairs = alignPairs(mainSource.nodes, mainTarget.nodes);
  const extraPairArrays = extraPages.map((page) =>
    alignPairs(page.sourceNodes, page.targetNodes),
  );

  // Merge and deduplicate aligned pairs across all pages
  const seenPairs = new Set<string>();
  const allPairs: AlignedPair[] = [];

  for (const pairs of [mainPairs, ...extraPairArrays]) {
    for (const p of pairs) {
      const key = `${p.sourceText.toLowerCase()}|||${p.targetText.toLowerCase()}`;
      if (!seenPairs.has(key)) {
        seenPairs.add(key);
        allPairs.push(p);
      }
    }
  }

  // Merge all source/target nodes for node count reporting
  const allSourceNodes = [
    ...mainSource.nodes,
    ...extraPages.flatMap((p) => p.sourceNodes),
  ];
  const allTargetNodes = [
    ...mainTarget.nodes,
    ...extraPages.flatMap((p) => p.targetNodes),
  ];

  // Verify languages using Lingo.dev /process/recognize
  const sourceSample = allSourceNodes.slice(0, 10).map((n) => n.text).join(". ");
  const targetSample = allTargetNodes.slice(0, 10).map((n) => n.text).join(". ");

  const [sourceDetected, targetDetected] = await Promise.all([
    getLingo().recognizeLocale(sourceSample),
    getLingo().recognizeLocale(targetSample),
  ]);

  const result: CrawlResult = {
    sourceUrl,
    targetUrl,
    sourceLocale: sourceDetected || sourceLocale,
    targetLocale: targetDetected || targetLocale,
    sourceNodes: allSourceNodes,
    targetNodes: allTargetNodes,
    alignedPairs: allPairs,
  };

  return NextResponse.json(result);
}
