import { useApp } from "@/context";
import { cn } from "@/lib/utils";

type RentView = "ledger" | "bank" | "reminders";

const TABS: { key: RentView; label: string; href: string }[] = [
  { key: "ledger", label: "Ledger", href: "/rent" },
  { key: "bank", label: "Bank matching", href: "/rent/bank" },
  { key: "reminders", label: "Reminders", href: "/rent/reminders" },
];

/**
 * The three views of Rent. Real links, so each view has its own URL and
 * cmd-click opens it in a tab; a count rides on the views waiting for a person.
 */
export function RentTabs({ active, navigate }: { active: RentView; navigate: (to: string) => void }) {
  const { attention } = useApp();
  const count: Record<RentView, number> = { ledger: 0, bank: attention.bank_review, reminders: attention.reminders_due };
  return (
    <nav aria-label="Rent views" className="inline-flex max-w-full items-center overflow-x-auto rounded-full bg-muted p-[0.1875rem]">
      {TABS.map((t) => (
        <a
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? "page" : undefined}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            navigate(t.href);
          }}
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-3 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
            active === t.key ? "bg-card text-foreground shadow-raised" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
          {count[t.key] > 0 ? (
            <span className="rounded-full bg-brand-tint px-1.5 text-[11px] font-semibold leading-[1.125rem] text-brand-text tabular-nums">
              {count[t.key]}
            </span>
          ) : null}
        </a>
      ))}
    </nav>
  );
}
