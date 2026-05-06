import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Sheet({
  children,
  open = true,
}: {
  children: ReactNode;
  open?: boolean;
}) {
  if (!open) return null;
  return <>{children}</>;
}

export function SheetContent({ className, ...props }: ComponentProps<"aside">) {
  return (
    <aside
      className={cn(
        "fixed inset-y-0 right-0 z-50 flex h-full w-3/4 flex-col gap-4 border-l bg-background/92 p-6 shadow-none backdrop-blur-xl sm:max-w-lg",
        className,
      )}
      {...props}
    />
  );
}

export function SheetHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-1.5 text-left", className)}
      {...props}
    />
  );
}

export function SheetTitle({ className, ...props }: ComponentProps<"h2">) {
  return (
    <h2
      className={cn(
        "text-lg font-semibold leading-none text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function SheetDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)} {...props} />
  );
}
