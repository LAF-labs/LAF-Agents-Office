import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function Avatar({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "relative flex size-8 shrink-0 overflow-hidden rounded-full",
        className,
      )}
      {...props}
    />
  );
}

export function AvatarFallback({
  className,
  ...props
}: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "flex size-full items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
