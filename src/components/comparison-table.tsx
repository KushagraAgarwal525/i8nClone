"use client";

import type { EngineConfig } from "@/lib/types";

interface SampleEngine {
  company: string;
  sourceLocale: string;
  targetLocale: string;
  engineConfig: EngineConfig;
}

interface Props {
  engines: SampleEngine[];
}

export function ComparisonTable({ engines }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="text-left py-3 pr-6 text-xs font-mono text-[#666] uppercase tracking-widest w-[180px]">
              Metric
            </th>
            {engines.map((e) => (
              <th
                key={e.company}
                className="text-left py-3 px-4 text-sm font-bold text-[#e8ff47] border-l border-[#222]"
              >
                {e.company}
                <span className="block text-xs font-mono font-normal text-[#555] mt-0.5">
                  {e.sourceLocale} → {e.targetLocale}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Formality */}
          <tr className="border-t border-[#1a1a1a]">
            <td className="py-3 pr-6 text-xs font-mono text-[#555] uppercase tracking-widest align-top">
              Formality
            </td>
            {engines.map((e) => (
              <td key={e.company} className="py-3 px-4 border-l border-[#1a1a1a] align-top">
                <span className="text-xs font-mono bg-[#47c8ff15] text-[#47c8ff] border border-[#47c8ff30] px-2 py-0.5">
                  {e.engineConfig.brandVoice.formality ?? "—"}
                </span>
              </td>
            ))}
          </tr>
          {/* Tone */}
          <tr className="border-t border-[#1a1a1a]">
            <td className="py-3 pr-6 text-xs font-mono text-[#555] uppercase tracking-widest align-top">
              Tone
            </td>
            {engines.map((e) => (
              <td key={e.company} className="py-3 px-4 border-l border-[#1a1a1a] align-top">
                <span className="text-xs font-mono bg-[#e8ff4715] text-[#e8ff47] border border-[#e8ff4730] px-2 py-0.5">
                  {e.engineConfig.brandVoice.tone ?? "—"}
                </span>
              </td>
            ))}
          </tr>
          {/* Brand voice */}
          <tr className="border-t border-[#1a1a1a]">
            <td className="py-3 pr-6 text-xs font-mono text-[#555] uppercase tracking-widest align-top">
              Brand Voice
            </td>
            {engines.map((e) => (
              <td
                key={e.company}
                className="py-3 px-4 border-l border-[#1a1a1a] text-[#ccc] leading-relaxed align-top max-w-[220px]"
              >
                {e.engineConfig.brandVoice.text}
              </td>
            ))}
          </tr>
          {/* Non-translatables count */}
          <tr className="border-t border-[#1a1a1a]">
            <td className="py-3 pr-6 text-xs font-mono text-[#555] uppercase tracking-widest align-top">
              Non-translatables
            </td>
            {engines.map((e) => {
              const count = e.engineConfig.glossaryItems.filter(
                (g) => g.type === "non_translatable"
              ).length;
              return (
                <td
                  key={e.company}
                  className="py-3 px-4 border-l border-[#1a1a1a] font-mono text-[#f0f0f0] align-top"
                >
                  {count}
                  <span className="text-[#555] ml-1">terms</span>
                </td>
              );
            })}
          </tr>
          {/* Sample glossary */}
          <tr className="border-t border-[#1a1a1a]">
            <td className="py-3 pr-6 text-xs font-mono text-[#555] uppercase tracking-widest align-top">
              Sample Glossary
            </td>
            {engines.map((e) => {
              const custom = e.engineConfig.glossaryItems
                .filter((g) => g.type === "custom_translation")
                .slice(0, 3);
              return (
                <td
                  key={e.company}
                  className="py-3 px-4 border-l border-[#1a1a1a] align-top"
                >
                  <div className="space-y-1">
                    {custom.map((g, i) => (
                      <div key={i} className="text-xs font-mono">
                        <span className="text-[#888]">{g.sourceText}</span>
                        <span className="text-[#444] mx-1">→</span>
                        <span className="text-[#4dff91]">{g.targetText}</span>
                      </div>
                    ))}
                    {custom.length === 0 && (
                      <span className="text-[#444] text-xs">—</span>
                    )}
                  </div>
                </td>
              );
            })}
          </tr>
          {/* Instructions count */}
          <tr className="border-t border-[#1a1a1a]">
            <td className="py-3 pr-6 text-xs font-mono text-[#555] uppercase tracking-widest align-top">
              Instructions
            </td>
            {engines.map((e) => (
              <td
                key={e.company}
                className="py-3 px-4 border-l border-[#1a1a1a] align-top"
              >
                <span className="font-mono text-[#f0f0f0]">
                  {e.engineConfig.instructions.length}
                </span>
                <span className="text-[#555] ml-1 text-xs">rules</span>
              </td>
            ))}
          </tr>
          {/* First instruction */}
          <tr className="border-t border-[#1a1a1a]">
            <td className="py-3 pr-6 text-xs font-mono text-[#555] uppercase tracking-widest align-top">
              Sample Rule
            </td>
            {engines.map((e) => {
              const first = e.engineConfig.instructions[0];
              return (
                <td
                  key={e.company}
                  className="py-3 px-4 border-l border-[#1a1a1a] text-[#888] text-xs leading-relaxed align-top max-w-[220px]"
                >
                  {first ? (
                    <>
                      <span className="text-[#555] font-mono">[{first.name}]</span>
                      <br />
                      {first.text}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              );
            })}
          </tr>
          {/* Scorers */}
          <tr className="border-t border-[#1a1a1a]">
            <td className="py-3 pr-6 text-xs font-mono text-[#555] uppercase tracking-widest align-top">
              Quality Scorers
            </td>
            {engines.map((e) => (
              <td
                key={e.company}
                className="py-3 px-4 border-l border-[#1a1a1a] align-top"
              >
                <div className="flex flex-wrap gap-1">
                  {e.engineConfig.scorers.map((s, i) => (
                    <span
                      key={i}
                      className={`text-xs font-mono px-2 py-0.5 border ${
                        s.type === "boolean"
                          ? "bg-[#4dff9115] text-[#4dff91] border-[#4dff9130]"
                          : "bg-[#ff6b3515] text-[#ff6b35] border-[#ff6b3530]"
                      }`}
                    >
                      {s.name}
                    </span>
                  ))}
                </div>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
