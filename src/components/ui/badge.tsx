import * as React from "react";
import { cn } from "@/lib/cn";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "outline" | "dot";
  color?: string;
}

export function Badge({ className, variant = "default", color, style, ...props }: BadgeProps) {
  if (variant === "dot" && color) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-1.5 py-0.5 text-xs font-medium text-muted-foreground",
          className,
        )}
        {...props}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
        {props.children}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        variant === "outline"
          ? "border border-border text-foreground"
          : "bg-muted text-foreground",
        className,
      )}
      style={style}
      {...props}
    />
  );
}
