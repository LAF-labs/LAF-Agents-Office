import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function Input({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-10 w-full min-w-0 rounded-none border-0 border-b border-input bg-transparent px-0 py-1 text-base shadow-none outline-none transition-[background,border-color,color] selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      )}
      type={type}
      {...props}
    />
  );
}
