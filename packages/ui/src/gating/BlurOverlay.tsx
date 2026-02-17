import React from "react";

export interface BlurOverlayProps {
  children: React.ReactNode;
  intensity?: "light" | "medium" | "heavy";
  className?: string;
}

const intensityMap = {
  light: "backdrop-blur-sm bg-white/30 dark:bg-slate-900/30",
  medium: "backdrop-blur-md bg-white/50 dark:bg-slate-900/50",
  heavy: "backdrop-blur-lg bg-white/60 dark:bg-slate-900/60",
} as const;

export function BlurOverlay({
  children,
  intensity = "medium",
  className = "",
}: BlurOverlayProps) {
  return (
    <div
      className={`absolute inset-0 z-10 flex items-center justify-center ${intensityMap[intensity]} ${className}`}
    >
      <div className="relative z-20 w-full max-w-md px-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {children}
      </div>
    </div>
  );
}
