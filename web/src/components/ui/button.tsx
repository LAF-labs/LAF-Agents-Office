import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type ButtonVariant =
  | "default"
  | "destructive"
  | "ghost"
  | "link"
  | "outline"
  | "secondary";
type ButtonSize = "default" | "icon" | "lg" | "sm";

const buttonVariants: Record<ButtonVariant, string> = {
  default: "bg-primary text-primary-foreground shadow-none hover:bg-primary/90",
  destructive:
    "bg-destructive text-white shadow-none hover:bg-destructive/90 focus-visible:ring-destructive/20",
  ghost: "hover:bg-accent hover:text-accent-foreground",
  link: "text-primary underline-offset-4 hover:underline",
  outline:
    "border border-input bg-transparent shadow-none hover:bg-accent hover:text-accent-foreground",
  secondary:
    "bg-secondary text-secondary-foreground shadow-none hover:bg-secondary/80",
};

const buttonSizes: Record<ButtonSize, string> = {
  default: "h-10 px-4 py-2",
  icon: "size-10",
  lg: "h-11 px-6",
  sm: "h-8 px-3",
};

export interface ButtonProps extends ComponentProps<"button"> {
  size?: ButtonSize;
  variant?: ButtonVariant;
}

export function Button({
  className,
  size = "default",
  type = "button",
  variant = "default",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-[background,border-color,box-shadow,color] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      type={type}
      {...props}
    />
  );
}
