import { useState } from "react";
import { Terminal, Check, Loader2 } from "lucide-react";
import { useApp } from "../../context";
import { PAID_PLANS } from "../../../shared/plan-config";

const PLANS = Object.values(PAID_PLANS);

export function DevPlanSwitcher() {
  const app = useApp();
  const user = app.user;
  const [switching, setSwitching] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!user) return null;

  const isDeveloper =
    user.email === "jamesbriandungu@gmail.com" ||
    user.role === "admin" ||
    user.email.endsWith("@antigravity.internal");

  if (!isDeveloper) return null;

  const currentPlan = user.plan || "free";

  async function handleSwitch(targetPlan: string) {
    if (targetPlan === currentPlan) return;
    setSwitching(targetPlan);
    setFeedback(null);

    try {
      const res = await fetch("/api/developer/switch-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: targetPlan }),
      });

      const data = (await res.json()) as { error?: string; user?: any };
      if (!res.ok) {
        throw new Error(data.error || "Failed to switch plan.");
      }

      if (data.user) {
        app.setUser(data.user);
      } else {
        await app.checkAuth();
      }

      setFeedback(`Active plan switched to ${targetPlan.toUpperCase()}`);
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      setFeedback("Error: " + (err as Error).message);
    } finally {
      setSwitching(null);
    }
  }

  return (
    <div className="bg-[#111614] text-stone-200 border-b border-stone-800 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0 z-20">
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1 font-mono font-bold text-amber-400 bg-amber-950/60 border border-amber-800/60 rounded px-1.5 py-0.5 text-[11px]">
          <Terminal className="h-3 w-3" />
          DEV DEBUGGER
        </span>
        <span className="text-stone-400 hidden sm:inline">
          Logged in as <strong className="text-stone-200 font-mono">{user.email}</strong>
        </span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-stone-400 text-[11px] font-medium mr-1">
          {currentPlan === "free" ? "Legacy access · switch to paid plan:" : "Switch debug plan:"}
        </span>
        {PLANS.map((p) => {
          const isActive = currentPlan === p.id;
          const isPending = switching === p.id;
          return (
            <button
              key={p.id}
              type="button"
              disabled={Boolean(switching) || isActive}
              onClick={() => handleSwitch(p.id)}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-all ${
                isActive
                  ? "bg-emerald-600 text-white font-bold ring-1 ring-emerald-400"
                  : "bg-stone-800/80 text-stone-300 hover:bg-stone-700 hover:text-white border border-stone-700/60"
              } disabled:opacity-80`}
            >
              {isPending ? (
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
              ) : isActive ? (
                <Check className="h-2.5 w-2.5 text-white" />
              ) : null}
              <span>{p.name} · {p.properties} props / {p.units} units</span>
            </button>
          );
        })}

        {feedback && (
          <span className="text-[11px] text-emerald-400 font-semibold ml-2 animate-in fade-in">
            {feedback}
          </span>
        )}
      </div>
    </div>
  );
}
