import type { EngineConfig } from "@/lib/types";

interface Props {
  items: EngineConfig["glossaryItems"];
}

export function GlossaryTable({ items }: Props) {
  if (!items.length) {
    return (
      <div className="text-sm text-[#444] font-mono py-4 text-center">
        No glossary items extracted
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm font-mono">
        <thead>
          <tr className="border-b border-[#222]">
            <th className="text-left text-xs text-[#444] uppercase tracking-wider pb-3 pr-4">
              Source Term
            </th>
            <th className="text-left text-xs text-[#444] uppercase tracking-wider pb-3 pr-4">
              Target Term
            </th>
            <th className="text-left text-xs text-[#444] uppercase tracking-wider pb-3 pr-4">
              Type
            </th>
            <th className="text-left text-xs text-[#444] uppercase tracking-wider pb-3">
              Hint
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} className="border-b border-[#1a1a1a] group">
              <td className="py-3 pr-4 text-[#f0f0f0]">{item.sourceText}</td>
              <td className="py-3 pr-4 text-[#e8ff47]">{item.targetText}</td>
              <td className="py-3 pr-4">
                <span
                  className={`text-xs px-2 py-0.5 ${
                    item.type === "non_translatable"
                      ? "bg-[#ff6b3515] text-[#ff6b35] border border-[#ff6b3530]"
                      : "bg-[#4dff9115] text-[#4dff91] border border-[#4dff9130]"
                  }`}
                >
                  {item.type === "non_translatable"
                    ? "keep"
                    : "translate"}
                </span>
              </td>
              <td className="py-3 text-[#666]">{item.hint || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
