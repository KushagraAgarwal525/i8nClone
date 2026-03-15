import * as cheerio from "cheerio";
import type { Element, AnyNode } from "domhandler";
import type { TextNode } from "./types";

// Tags to skip entirely (not visible or not translatable)
const SKIP_TAGS = new Set([
  "script", "style", "noscript", "svg", "path", "meta",
  "link", "iframe", "video", "audio", "source", "picture",
  "code", "pre", "img", "input", "select", "textarea",
  "canvas", "template", "object", "embed",
]);

// Tags whose full text content should be extracted (prose containers)
const TEXT_CONTENT_TAGS = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6",
  "li", "td", "th", "blockquote", "figcaption", "dt", "dd",
  "label", "caption", "summary",
]);

// Block containers: only extract their DIRECT text nodes, not children's text.
// This prevents "TitleSubtitle" concatenation from elements like:
//   <div><span>Title</span><span>Subtitle</span></div>
const BLOCK_CONTAINERS = new Set([
  "div", "section", "article", "header", "footer", "main", "aside", "nav",
  "ul", "ol", "dl", "table", "tbody", "thead", "tfoot", "tr",
  "form", "fieldset", "details",
]);

const MAX_EXTRA_PAGES = 3;
const FETCH_TIMEOUT = 12_000;

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
};

export interface PageResult {
  nodes: TextNode[];
  links: string[];
}

// ─── DOM path utility (for alignment) ───────────────────────────────────────

function getPath(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current.type === "tag") {
    const tagName = current.tagName.toLowerCase();
    const parent = current.parentNode;
    if (parent && "children" in parent) {
      const siblings = (parent.children as AnyNode[]).filter(
        (c): c is Element =>
          c.type === "tag" && (c as Element).tagName === current!.tagName,
      );
      if (siblings.length > 1) {
        const idx = siblings.indexOf(current) + 1;
        parts.unshift(`${tagName}:nth-child(${idx})`);
      } else {
        parts.unshift(tagName);
      }
    } else {
      parts.unshift(tagName);
    }
    current = parent as Element | null;
  }
  return parts.join(">");
}

// ─── Single-page extraction ──────────────────────────────────────────────────

function extractFromHtml(html: string, baseUrl: string): PageResult {
  const $ = cheerio.load(html);
  const nodes: TextNode[] = [];
  const seen = new Set<string>();
  let index = 0;

  $("body *").each((_, el) => {
    if (el.type !== "tag") return;
    const tagName = (el as Element).tagName.toLowerCase();
    if (SKIP_TAGS.has(tagName)) return;

    const $el = $(el);
    let text: string;

    if (TEXT_CONTENT_TAGS.has(tagName)) {
      // Prose elements (p, h1-h6, li, etc.): use full text including inline children
      text = $el.text().trim();
    } else if (BLOCK_CONTAINERS.has(tagName)) {
      // Block containers: only take direct text nodes to avoid concatenation
      text = $el
        .contents()
        .filter((_, node) => node.type === "text")
        .text()
        .trim();
    } else {
      // Standalone elements (a, button, span): use full text only if leaf
      const hasChildElements =
        $el.children().filter((_, child) => {
          if (child.type !== "tag") return false;
          return !SKIP_TAGS.has((child as Element).tagName?.toLowerCase());
        }).length > 0;
      if (hasChildElements) return; // children will be processed individually
      text = $el.text().trim();
    }

    // Quality filters
    if (!text || text.length < 2 || text.length > 800) return;
    if (/^[\d\s.,;:!?@#$%^&*()\-+=/<>{}[\]|\\~`"']+$/.test(text)) return;
    // Reject concatenated blobs: long text with very few spaces
    if (text.length > 30 && (text.match(/\s/g)?.length ?? 0) / text.length < 0.05) return;

    const normText = text.replace(/\s+/g, " ").toLowerCase();
    if (seen.has(normText)) return;
    seen.add(normText);

    nodes.push({
      path: getPath(el as Element),
      tag: tagName,
      text,
      index: index++,
    });
  });

  // Discover internal links (sorted by content-richness score)
  const links: string[] = [];
  const base = new URL(baseUrl);
  const seenLinks = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.hostname !== base.hostname) return;
      if (resolved.pathname === base.pathname) return;
      if (/\.(pdf|jpg|png|svg|gif|ico|css|js|xml|json|zip|woff2?)$/i.test(resolved.pathname)) return;
      if (/(\/api\/|\/auth\/|\/login|\/signup|\/callback|\/webhook|\/rss|\/feed|\/sitemap)/i.test(resolved.pathname)) return;

      const clean = resolved.origin + resolved.pathname;
      if (seenLinks.has(clean)) return;
      seenLinks.add(clean);
      links.push(clean);
    } catch {
      /* ignore bad URLs */
    }
  });

  // Rank links: prefer content-rich marketing pages
  links.sort((a, b) => linkScore(b) - linkScore(a));

  return { nodes, links };
}

function linkScore(url: string): number {
  const path = new URL(url).pathname.toLowerCase();
  let score = 1;
  if (/\/(product|pricing|features|about|solutions|enterprise|customers|case-stud|integrations|security|trust|platform|overview)/i.test(path)) score += 5;
  const depth = path.split("/").filter(Boolean).length;
  if (depth >= 1 && depth <= 3) score += 2;
  if (depth > 4) score -= 3;
  return score;
}

// ─── URL mapping for multi-page crawling ─────────────────────────────────────

/**
 * Build a function that maps source-site links to equivalent target-site links.
 * Detects the locale transformation pattern from the provided URL pair.
 */
export function buildUrlMapper(
  sourceUrl: string,
  targetUrl: string,
): (sourceLink: string) => string | null {
  const src = new URL(sourceUrl);
  const tgt = new URL(targetUrl);
  const srcPath = src.pathname.replace(/\/$/, "");
  const tgtPath = tgt.pathname.replace(/\/$/, "");

  if (src.hostname === tgt.hostname) {
    // Same host → path prefix transformation
    return (link: string) => {
      try {
        const u = new URL(link);
        if (u.hostname !== src.hostname) return null;
        const lp = u.pathname.replace(/\/$/, "");
        if (srcPath && lp.startsWith(srcPath)) {
          u.pathname = tgtPath + lp.slice(srcPath.length);
        } else if (!srcPath) {
          u.pathname = tgtPath + lp;
        } else {
          // Different prefix — try prepending target locale path
          u.pathname = tgtPath + lp;
        }
        return u.toString();
      } catch {
        return null;
      }
    };
  }

  // Different hostname → swap hosts
  return (link: string) => {
    try {
      const u = new URL(link);
      if (u.hostname === src.hostname) {
        u.hostname = tgt.hostname;
        return u.toString();
      }
      return null;
    } catch {
      return null;
    }
  };
}

// ─── Fetch with timeout ──────────────────────────────────────────────────────

async function safeFetch(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: FETCH_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) return null;
    return await response.text();
  } catch {
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch and extract text from a single page.
 * Returns text nodes + internal links for multi-page discovery.
 */
export async function fetchAndExtract(url: string): Promise<PageResult> {
  const html = await safeFetch(url);
  if (!html) throw new Error(`Failed to fetch ${url}`);
  return extractFromHtml(html, url);
}

/**
 * Multi-page crawl: fetch main source+target pages, discover promising
 * internal links, crawl up to MAX_EXTRA_PAGES additional page pairs.
 * Returns per-page node arrays so caller can align each page pair independently.
 */
export async function crawlMultiPage(
  sourceUrl: string,
  targetUrl: string,
): Promise<{
  mainSource: PageResult;
  mainTarget: PageResult;
  extraPages: Array<{ sourceNodes: TextNode[]; targetNodes: TextNode[] }>;
}> {
  // Phase 1: Crawl main pages
  const [mainSourceHtml, mainTargetHtml] = await Promise.all([
    safeFetch(sourceUrl),
    safeFetch(targetUrl),
  ]);
  if (!mainSourceHtml) throw new Error(`Failed to fetch source: ${sourceUrl}`);
  if (!mainTargetHtml) throw new Error(`Failed to fetch target: ${targetUrl}`);

  const mainSource = extractFromHtml(mainSourceHtml, sourceUrl);
  const mainTarget = extractFromHtml(mainTargetHtml, targetUrl);

  // Phase 2: Build extra page pairs from discovered links
  const mapper = buildUrlMapper(sourceUrl, targetUrl);
  const candidates = mainSource.links.slice(0, MAX_EXTRA_PAGES * 3);
  const pagePairs: Array<{ source: string; target: string }> = [];
  for (const srcLink of candidates) {
    if (pagePairs.length >= MAX_EXTRA_PAGES) break;
    const tgtLink = mapper(srcLink);
    if (tgtLink) pagePairs.push({ source: srcLink, target: tgtLink });
  }

  // Phase 3: Crawl extra pages in parallel
  const extraPages: Array<{ sourceNodes: TextNode[]; targetNodes: TextNode[] }> = [];
  if (pagePairs.length > 0) {
    const results = await Promise.allSettled(
      pagePairs.map(async ({ source, target }) => {
        const [srcHtml, tgtHtml] = await Promise.all([
          safeFetch(source),
          safeFetch(target),
        ]);
        if (!srcHtml || !tgtHtml) return null;
        return {
          sourceNodes: extractFromHtml(srcHtml, source).nodes,
          targetNodes: extractFromHtml(tgtHtml, target).nodes,
        };
      }),
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        extraPages.push(r.value);
      }
    }
  }

  return { mainSource, mainTarget, extraPages };
}
