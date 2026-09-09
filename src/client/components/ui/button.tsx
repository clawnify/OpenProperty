import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * 28px tall at an 8px radius, 15px/500. Not a pill: a full-round button reads
 * consumer, an 8px corner reads tool. There is exactly ONE solid `default` per
 * screen; everything else is `secondary` (white with the raised shadow ring
 * rather than a painted border, which reads crisper than a 1px line at this
 * height), `ghost` (Cancel, toolbar view-state), or `destructive`.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[var(--edge-solid)]",
        secondary: "bg-secondary text-secondary-foreground hover:bg-muted shadow-raised",
        outline: "bg-secondary text-secondary-foreground hover:bg-muted shadow-raised",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        // Danger tint at rest, filling solid only on hover: a delete button
        // that is already loud at rest makes every screen it sits on loud.
        destructive: "bg-destructive-tint text-destructive hover:bg-destructive-solid hover:text-destructive-foreground",
        link: "text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground",
      },
      size: {
        default: "h-7 px-2",
        sm: "h-7 px-2 text-[0.8125rem]",
        lg: "h-8 px-3",
        icon: "h-7 w-7 px-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
