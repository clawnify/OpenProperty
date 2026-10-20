import { useEffect } from "react";
import { useApp } from "../context";
import { X, AlertCircle } from "lucide-react";

export function ErrorBanner() {
  const { error, setError } = useApp();

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => {
      setError(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [error, setError]);

  if (!error) return null;

  return (
    <div className="fixed bottom-5 left-1/2 z-50 flex w-[min(92vw,480px)] -translate-x-1/2 items-center gap-3 rounded-xl border border-destructive/30 bg-destructive-tint/95 backdrop-blur-md px-4 py-3 text-sm font-medium text-destructive shadow-xl animate-in fade-in slide-in-from-bottom-3 duration-200">
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-xs leading-relaxed">{error}</span>
      <button
        type="button"
        onClick={() => setError(null)}
        className="opacity-70 hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-destructive/10"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
