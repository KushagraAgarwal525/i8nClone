import type { EngineConfig } from "@/lib/types";

interface Props {
  instructions: EngineConfig["instructions"];
}

export function InstructionsList({ instructions }: Props) {
  if (!instructions.length) {
    return (
      <div className="text-sm text-[#444] font-mono py-4 text-center">
        No instructions extracted
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {instructions.map((inst, i) => (
        <li key={i} className="flex gap-4 items-start">
          <span className="text-[#444] font-mono text-xs mt-1 min-w-[20px]">
            {String(i + 1).padStart(2, "0")}
          </span>
          <div>
            <span className="text-xs font-mono text-[#e8ff47] uppercase tracking-wide">
              {inst.name}
            </span>
            <p className="text-sm text-[#ccc] mt-1">{inst.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
