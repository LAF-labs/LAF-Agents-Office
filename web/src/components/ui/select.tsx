import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "flex h-10 w-full min-w-0 items-center justify-between rounded-none border-0 border-b border-input bg-transparent px-0 py-1 text-sm shadow-none outline-none transition-[background,border-color,color] focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
