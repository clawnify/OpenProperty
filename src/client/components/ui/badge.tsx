import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * A badge is a SIGNAL: a value from a known set that wants attention (Paid,
 * Overdue, Urgent). Tinted fill, same-hue text, medium weight, no border.
 * A plain fact (a type, a category, a count) is a `neutral` chip instead —
 * if every value is a badge, none of them says anything.
 */
const badgeVariants = cva(
  "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-muted text-muted-foreground",
        neutral: "bg-muted text-muted-foreground",
        info: "bg-info-tint text-info",
        success: "bg-success-tint text-success",
        warning: "bg-warning-tint text-warning",
        destructive: "bg-destructive-tint text-destructive",
        brand: "bg-brand-tint text-brand-text",
        outline: "text-foreground shadow-edge",
        secondary: "bg-muted text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
