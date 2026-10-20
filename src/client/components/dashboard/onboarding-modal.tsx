import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Building2, UserCheck, ArrowRight, Loader2, Check } from "lucide-react";
import { api } from "@/api";
import type { User } from "@/types";

interface OnboardingModalProps {
  isOpen: boolean;
  user: User | null;
  onClose: () => void;
  onComplete: (updatedUser: User) => void;
}

export function OnboardingModal({ isOpen, user, onClose, onComplete }: OnboardingModalProps) {
  const [step, setStep] = useState(1);
  const [preferredName, setPreferredName] = useState(user?.name || "");
  const [titlePrefix, setTitlePrefix] = useState("");
  const [managementType, setManagementType] = useState<"landlord" | "caretaker" | "admin">("landlord");
  const [unitRange, setUnitRange] = useState("3");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !user) return null;

  async function handleFinish() {
    setSaving(true);
    setError(null);
    try {
      const finalName = titlePrefix
        ? `${titlePrefix} ${preferredName.replace(/^(Landlord|Property Manager|Dr\.|Mr\.|Mrs\.|Chairman)\s+/i, "")}`
        : preferredName;

      const res = await api<{ user: User }>("PATCH", "/api/auth/profile", {
        name: finalName.trim() || user!.name,
        role: managementType,
      });

      // Save onboarding completion flag
      localStorage.setItem(`koditrack_onboarded_${user!.id}`, "true");
      onComplete(res.user);
      onClose();
    } catch (err) {
      setError((err as Error).message || "Could not save preferences.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            <Sparkles className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center text-lg font-bold">
            Welcome to KodiTrack
          </DialogTitle>
          <DialogDescription className="text-center text-xs text-muted-foreground">
            Let's personalize your workspace and greeting so the platform works smoothly for your rental workflow.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-lg bg-destructive-tint p-2.5 text-xs font-medium text-destructive border border-destructive/20">
            {error}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold text-foreground">
                What should we call you on your dashboard greeting?
              </Label>
              <p className="text-[11px] text-muted-foreground mb-2">
                This will appear on your morning & evening greeting screen.
              </p>
              <Input
                value={preferredName}
                onChange={(e) => setPreferredName(e.target.value)}
                placeholder="e.g. Brian, Peter, or Jane"
                className="text-sm font-medium"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-foreground block mb-1.5">
                Optional Title / Honorific
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "None", value: "" },
                  { label: "Landlord", value: "Landlord" },
                  { label: "Property Manager", value: "Property Manager" },
                  { label: "Dr.", value: "Dr." },
                  { label: "Chairman", value: "Chairman" },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setTitlePrefix(item.value)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium border transition-colors ${
                      titlePrefix === item.value
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                        : "bg-muted/50 border-border text-foreground hover:bg-muted"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-muted/40 p-3 border border-border/60">
              <span className="text-[11px] text-muted-foreground block">Greeting preview:</span>
              <span className="text-sm font-bold text-foreground">
                Good morning, {titlePrefix ? `${titlePrefix} ` : ""}{preferredName.split(" ")[0] || "Landlord"}! ☀️
              </span>
            </div>

            <Button
              type="button"
              onClick={() => setStep(2)}
              className="w-full bg-[#155e4f] hover:bg-[#0f4a3e] text-white"
            >
              <span>Continue</span>
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold text-foreground">
                How do you primarily manage your properties?
              </Label>
              <div className="mt-2 space-y-2">
                {[
                  { id: "landlord", title: "Independent Landlord", desc: "I own and manage my own rental units" },
                  { id: "caretaker", title: "Property Manager / Caretaker", desc: "I manage properties on behalf of landlords or owners" },
                  { id: "admin", title: "Real Estate Agency / Investor", desc: "Multi-property commercial or residential portfolio" },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setManagementType(t.id as never)}
                    className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all ${
                      managementType === t.id
                        ? "border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-xs"
                        : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      managementType === t.id
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-muted-foreground/40"
                    }`}>
                      {managementType === t.id && <Check className="h-3 w-3" />}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-foreground">{t.title}</div>
                      <div className="text-[11px] text-muted-foreground">{t.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-foreground">
                Approximate units to manage:
              </Label>
              <div className="grid grid-cols-4 gap-2 mt-1.5">
                {[
                  { range: "1–3", val: "3" },
                  { range: "4–15", val: "15" },
                  { range: "16–50", val: "50" },
                  { range: "50+", val: "200" },
                ].map((u) => (
                  <button
                    key={u.val}
                    type="button"
                    onClick={() => setUnitRange(u.val)}
                    className={`rounded-lg border py-2 text-center text-xs font-bold transition-colors ${
                      unitRange === u.val
                        ? "border-emerald-600 bg-emerald-600 text-white shadow-xs"
                        : "border-border text-foreground hover:bg-muted"
                    }`}
                  >
                    {u.range}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
                className="w-1/3"
              >
                Back
              </Button>
              <Button
                type="button"
                disabled={saving}
                onClick={handleFinish}
                className="w-2/3 bg-[#155e4f] hover:bg-[#0f4a3e] text-white"
              >
                {saving ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</>
                ) : (
                  <><span>Finish & Start</span><Check className="ml-1.5 h-4 w-4" /></>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
