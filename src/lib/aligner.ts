import type { TextNode, AlignedPair } from "./types";

/**
 * Normalize a DOM path for fuzzy matching.
 * Strips nth-child indices so "section:nth-child(2)>h1" becomes "section>h1".
 */
function normalizePath(path: string): string {
  return path.replace(/:nth-child\(\d+\)/g, "");
}

/**
 * Length ratio heuristic: European translations are typically 0.7x–1.4x
 * the length of the English source.
 */
function lengthRatioScore(a: string, b: string): number {
  const ratio = a.length / b.length;
  if (ratio >= 0.5 && ratio <= 2.0) return 1 - Math.abs(1 - ratio);
  return 0;
}

/**
 * Score a pair's usefulness for style extraction.
 * Higher = more valuable for analysis.
 */
function pairQuality(source: string, target: string): number {
  let score = 0;
  const srcWords = source.split(/\s+/).length;
  const tgtWords = target.split(/\s+/).length;
  // More words → more style signal
  score += Math.min(srcWords, tgtWords) * 2;
  // Longer sentences → bonus
  if (source.length > 30) score += 3;
  if (source.length > 60) score += 5;
  if (source.length > 100) score += 3;
  // Reasonable length ratio → bonus
  score += lengthRatioScore(source, target) * 4;
  // Penalty for very short
  if (source.length < 15 || target.length < 15) score -= 5;
  return score;
}

export function alignPairs(
  sourceNodes: TextNode[],
  targetNodes: TextNode[],
): AlignedPair[] {
  const aligned: AlignedPair[] = [];
  const usedTargetIndices = new Set<number>();

  // Pass 1: Exact DOM path match
  for (const source of sourceNodes) {
    const exactMatch = targetNodes.findIndex(
      (t, i) => !usedTargetIndices.has(i) && t.path === source.path,
    );
    if (exactMatch !== -1) {
      const target = targetNodes[exactMatch];
      if (source.text !== target.text) {
        aligned.push({
          sourcePath: source.path,
          sourceText: source.text,
          targetText: target.text,
          tag: source.tag,
        });
        usedTargetIndices.add(exactMatch);
      }
    }
  }

  // Pass 2: Normalized path match (without nth-child) for remaining
  for (const source of sourceNodes) {
    if (aligned.some((a) => a.sourcePath === source.path)) continue;

    const normSource = normalizePath(source.path);
    const candidates = targetNodes
      .map((t, i) => ({ node: t, index: i }))
      .filter(
        ({ node, index }) =>
          !usedTargetIndices.has(index) &&
          normalizePath(node.path) === normSource &&
          node.tag === source.tag &&
          node.text !== source.text,
      );

    if (candidates.length === 1) {
      aligned.push({
        sourcePath: source.path,
        sourceText: source.text,
        targetText: candidates[0].node.text,
        tag: source.tag,
      });
      usedTargetIndices.add(candidates[0].index);
    } else if (candidates.length > 1) {
      const best = candidates.sort(
        (a, b) =>
          lengthRatioScore(source.text, b.node.text) -
          lengthRatioScore(source.text, a.node.text),
      )[0];
      aligned.push({
        sourcePath: source.path,
        sourceText: source.text,
        targetText: best.node.text,
        tag: source.tag,
      });
      usedTargetIndices.add(best.index);
    }
  }

  // Pass 3: Positional fallback — match by document order for same tag types
  for (const source of sourceNodes) {
    if (aligned.some((a) => a.sourcePath === source.path)) continue;

    const candidate = targetNodes.find(
      (t, i) =>
        !usedTargetIndices.has(i) &&
        t.tag === source.tag &&
        t.text !== source.text &&
        lengthRatioScore(source.text, t.text) > 0.4,
    );

    if (candidate) {
      const idx = targetNodes.indexOf(candidate);
      aligned.push({
        sourcePath: source.path,
        sourceText: source.text,
        targetText: candidate.text,
        tag: source.tag,
      });
      usedTargetIndices.add(idx);
    }
  }

  // Quality filter and sort: best pairs first
  return aligned
    .filter((p) => {
      // Skip identity pairs (same text = not a real translation)
      if (p.sourceText.toLowerCase() === p.targetText.toLowerCase()) return false;
      // Skip pairs with extreme length ratio (likely misaligned)
      if (lengthRatioScore(p.sourceText, p.targetText) < 0.15) return false;
      return true;
    })
    .sort((a, b) =>
      pairQuality(b.sourceText, b.targetText) -
      pairQuality(a.sourceText, a.targetText),
    )
    .slice(0, 100);
}
