import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function ChartFrame({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/65">{title}</h3>
        {actions}
      </div>
      <div className={cn("h-[320px] w-full")}>{children}</div>
    </div>
  );
}
