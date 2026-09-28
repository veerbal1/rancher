import type { ReactNode } from "react";

export function MenuPanel({ children }: { children?: ReactNode }) {
  return (
    <aside className="fixed top-4 right-4 bottom-4 z-10 flex w-96 flex-col overflow-y-auto rounded-2xl border border-white/60 bg-white/80 p-4 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_8px_32px_rgba(0,0,0,0.18)] backdrop-blur-xl backdrop-saturate-180">
      {children}
    </aside>
  );
}
