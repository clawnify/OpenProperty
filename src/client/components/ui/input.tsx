import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * 32px, 8px radius, and the edge is an inset ring so focus thickens it without
 * shifting a single pixel of layout.
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex h-8 w-full rounded-sm bg-card px-3 text-[0.9375rem] text-foreground shadow-edge transition-shadow duration-150 outline-none placeholder:text-faint file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground focus:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_var(--brand-tint)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
