"use client";

import { useState } from "react";

const LOCALES = [
  { code: "en", label: "English (en)" },
  { code: "de", label: "German (de)" },
  { code: "fr", label: "French (fr)" },
  { code: "es", label: "Spanish (es)" },
  { code: "ja", label: "Japanese (ja)" },
  { code: "pt", label: "Portuguese (pt)" },
  { code: "zh", label: "Chinese (zh)" },
  { code: "ko", label: "Korean (ko)" },
  { code: "it", label: "Italian (it)" },
  { code: "nl", label: "Dutch (nl)" },
  { code: "pl", label: "Polish (pl)" },
  { code: "ru", label: "Russian (ru)" },
  { code: "sv", label: "Swedish (sv)" },
  { code: "tr", label: "Turkish (tr)" },
];

interface Props {
  onSubmit: (data: {
    sourceUrl: string;
    targetUrl: string;
    sourceLocale: string;
    targetLocale: string;
    companyName: string;
  }) => void;
  disabled?: boolean;
  // manual paste fallback
  onManualSubmit: (data: {
    pairsText: string;
    sourceLocale: string;
    targetLocale: string;
    companyName: string;
  }) => void;
}

function extractCompanyName(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "").split(".")[0];
  } catch {
    return "";
  }
}

export function UrlInputForm({ onSubmit, onManualSubmit, disabled }: Props) {
  const [sourceUrl, setSourceUrl] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [sourceLocale, setSourceLocale] = useState("en");
  const [targetLocale, setTargetLocale] = useState("de");
  const [showManual, setShowManual] = useState(false);
  const [manualText, setManualText] = useState("");
  const [manualCompany, setManualCompany] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const companyName = extractCompanyName(sourceUrl);
    onSubmit({ sourceUrl, targetUrl, sourceLocale, targetLocale, companyName });
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    onManualSubmit({
      pairsText: manualText,
      sourceLocale,
      targetLocale,
      companyName: manualCompany,
    });
  }

  return (
    <div className="space-y-6">
      {!showManual ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-mono text-[#666] uppercase tracking-widest mb-2">
                Source URL (English)
              </label>
              <input
                type="url"
                required
                placeholder="https://stripe.com"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                disabled={disabled}
                className="w-full bg-[#111] border border-[#222] text-[#f0f0f0] px-4 py-3 font-mono text-sm focus:outline-none focus:border-[#e8ff47] placeholder-[#444] disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-[#666] uppercase tracking-widest mb-2">
                Target URL (Translated)
              </label>
              <input
                type="url"
                required
                placeholder="https://stripe.com/de"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                disabled={disabled}
                className="w-full bg-[#111] border border-[#222] text-[#f0f0f0] px-4 py-3 font-mono text-sm focus:outline-none focus:border-[#e8ff47] placeholder-[#444] disabled:opacity-50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-[#666] uppercase tracking-widest mb-2">
                Source Locale
              </label>
              <select
                value={sourceLocale}
                onChange={(e) => setSourceLocale(e.target.value)}
                disabled={disabled}
                className="w-full bg-[#111] border border-[#222] text-[#f0f0f0] px-4 py-3 font-mono text-sm focus:outline-none focus:border-[#e8ff47] disabled:opacity-50"
              >
                {LOCALES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono text-[#666] uppercase tracking-widest mb-2">
                Target Locale
              </label>
              <select
                value={targetLocale}
                onChange={(e) => setTargetLocale(e.target.value)}
                disabled={disabled}
                className="w-full bg-[#111] border border-[#222] text-[#f0f0f0] px-4 py-3 font-mono text-sm focus:outline-none focus:border-[#e8ff47] disabled:opacity-50"
              >
                {LOCALES.filter((l) => l.code !== sourceLocale).map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={disabled}
              className="flex-1 bg-[#e8ff47] text-[#0a0a0a] py-3 px-8 font-bold text-sm uppercase tracking-wider hover:bg-[#d4eb3c] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {disabled ? "Generating..." : "Generate Engine"}
            </button>
            <button
              type="button"
              onClick={() => setShowManual(true)}
              className="text-xs font-mono text-[#444] hover:text-[#666] underline"
            >
              Paste text manually
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleManualSubmit} className="space-y-4">
          <div className="bg-[#111] border border-[#222] border-l-[3px] border-l-[#47c8ff] p-4">
            <p className="text-xs font-mono text-[#666] mb-1">
              MANUAL PASTE FALLBACK
            </p>
            <p className="text-sm text-[#aaa]">
              For sites that block crawlers. One pair per line, separated by{" "}
              <code className="text-[#e8ff47]">|</code>
            </p>
          </div>

          <textarea
            required
            rows={10}
            placeholder={"Hello world | Hallo Welt\nGet started | Jetzt starten\nDeploy your app | Stelle deine App bereit"}
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            disabled={disabled}
            className="w-full bg-[#111] border border-[#222] text-[#f0f0f0] px-4 py-3 font-mono text-sm focus:outline-none focus:border-[#e8ff47] placeholder-[#444] disabled:opacity-50 resize-none"
          />

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-mono text-[#666] uppercase tracking-widest mb-2">
                Source Locale
              </label>
              <select
                value={sourceLocale}
                onChange={(e) => setSourceLocale(e.target.value)}
                disabled={disabled}
                className="w-full bg-[#111] border border-[#222] text-[#f0f0f0] px-3 py-2 font-mono text-sm focus:outline-none focus:border-[#e8ff47]"
              >
                {LOCALES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono text-[#666] uppercase tracking-widest mb-2">
                Target Locale
              </label>
              <select
                value={targetLocale}
                onChange={(e) => setTargetLocale(e.target.value)}
                disabled={disabled}
                className="w-full bg-[#111] border border-[#222] text-[#f0f0f0] px-3 py-2 font-mono text-sm focus:outline-none focus:border-[#e8ff47]"
              >
                {LOCALES.filter((l) => l.code !== sourceLocale).map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-mono text-[#666] uppercase tracking-widest mb-2">
                Company Name
              </label>
              <input
                type="text"
                required
                placeholder="stripe"
                value={manualCompany}
                onChange={(e) => setManualCompany(e.target.value)}
                className="w-full bg-[#111] border border-[#222] text-[#f0f0f0] px-3 py-2 font-mono text-sm focus:outline-none focus:border-[#e8ff47] placeholder-[#444]"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={disabled}
              className="flex-1 bg-[#e8ff47] text-[#0a0a0a] py-3 px-8 font-bold text-sm uppercase tracking-wider hover:bg-[#d4eb3c] transition-colors disabled:opacity-50"
            >
              {disabled ? "Generating..." : "Generate Engine"}
            </button>
            <button
              type="button"
              onClick={() => setShowManual(false)}
              className="text-xs font-mono text-[#444] hover:text-[#666] underline"
            >
              Back to URL mode
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
