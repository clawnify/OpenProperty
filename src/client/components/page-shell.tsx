import { cn } from "@/lib/utils";

/**
 * The page toolbar and the pane under it.
 *
 * The band is 56px with a rule beneath it — the same height as the sidebar's
 * brand row, so the two bottoms form one continuous line across the shell.
 * It sits OUTSIDE the scroll container: the title and the page's one action
 * stay put while the content moves, which is what makes a long table readable
 * (DESIGN.md → Layout, "The shell").
 *
 * Row one is identity: the title, then the count or period as quiet meta.
 * The right side is for the page's actions, and only the last of them is ink.
 */
export function PageShell({
  title,
  meta,
  actions,
  width = "max-w-7xl",
  children,
}: {
  title: React.ReactNode;
  /** The count or period this page is showing — `3 properties · 5 units`. */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  width?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-6">
        <h1 className="shrink-0 truncate text-[1.375rem] font-semibold leading-tight tracking-[-0.01em]">
          {title}
        </h1>
        {meta ? (
          <div className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{meta}</div>
        ) : (
          <div className="flex-1" />
        )}
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className={cn("mx-auto w-full space-y-6 p-6", width)}>{children}</div>
      </div>
    </div>
  );
}
