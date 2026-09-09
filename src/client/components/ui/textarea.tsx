import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        "flex min-h-[5rem] w-full rounded-sm bg-card px-3 py-2 text-[0.9375rem] leading-relaxed text-foreground shadow-edge transition-shadow duration-150 outline-none placeholder:text-faint focus:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_var(--brand-tint)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
