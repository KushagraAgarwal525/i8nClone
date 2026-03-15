"use client";

type Step = {
  id: string;
  label: string;
  detail?: string;
};

type StepStatus = "pending" | "active" | "done" | "error";

interface Props {
  steps: Step[];
  statuses: Record<string, StepStatus>;
}

export function ExtractionStepper({ steps, statuses }: Props) {
  return (
    <div className="space-y-3">
      {steps.map((step) => {
        const status = statuses[step.id] || "pending";
        return (
          <div
            key={step.id}
            className={`flex items-center gap-4 p-4 border transition-colors ${
              status === "active"
                ? "border-[#e8ff47] bg-[#e8ff4710]"
                : status === "done"
                ? "border-[#222] bg-[#111]"
                : status === "error"
                ? "border-[#ff6b35] bg-[#ff6b3510]"
                : "border-[#1a1a1a] bg-[#0d0d0d] opacity-40"
            }`}
          >
            <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
              {status === "active" && (
                <div className="w-4 h-4 border-2 border-[#e8ff47] border-t-transparent rounded-full animate-spin" />
              )}
              {status === "done" && (
                <svg
                  className="w-5 h-5 text-[#4dff91]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
              {status === "error" && (
                <span className="text-[#ff6b35] text-lg font-bold">✕</span>
              )}
              {status === "pending" && (
                <div className="w-2 h-2 rounded-full bg-[#333]" />
              )}
            </div>
            <div className="flex-1">
              <p
                className={`text-sm font-medium ${
                  status === "active"
                    ? "text-[#e8ff47]"
                    : status === "done"
                    ? "text-[#f0f0f0]"
                    : status === "error"
                    ? "text-[#ff6b35]"
                    : "text-[#444]"
                }`}
              >
                {step.label}
              </p>
              {step.detail && status !== "pending" && (
                <p className="text-xs font-mono text-[#666] mt-0.5">
                  {step.detail}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
