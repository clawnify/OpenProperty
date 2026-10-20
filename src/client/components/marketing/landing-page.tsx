import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MpesaCheckoutModal } from "./mpesa-checkout-modal";
import { PAID_PLANS } from "../../../shared/plan-config";
import {
  Building2,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Receipt,
  FileSpreadsheet,
  AlertTriangle,
  Smartphone,
  ChevronDown,
  ChevronUp,
  PhoneCall,
  Calendar,
  Layers,
  X,
  Loader2,
  Check,
  Menu,
  Wrench,
  Users,
  ArrowUpRight,
  Mail,
  Send,
} from "lucide-react";

/* ─── Props ─────────────────────────────────────────────────────────── */

interface LandingPageProps {
  onGetStarted: () => void;
  onSignIn: () => void;
  onSelectPlan?: (plan: string) => void;
  onNavigateContact?: () => void;
}

/* ─── Data ──────────────────────────────────────────────────────────── */

const PRICING = Object.values(PAID_PLANS).map((plan) => ({
  id: plan.id,
  name: plan.name,
  price: plan.priceKes.toLocaleString("en-KE"),
  period: "/mo",
  properties: plan.properties,
  units: plan.units,
  description: plan.description,
  features: [
    `Up to ${plan.properties} properties and ${plan.units} rental units`,
    "Properties, tenants, leases and rent ledger",
    "Payment receipts, arrears reports and CSV exports",
    "Maintenance work orders",
  ],
  cta: `Choose ${plan.name}`,
  popular: plan.id === "plus",
  note: "Manual monthly renewal",
}));

const FAQS = [
  {
    q: "How do the plans work?",
    a: "Each paid plan has both a property cap and a rental-unit cap. Choose the tier that fits both parts of your portfolio. Existing legacy accounts keep their current access; new accounts choose a paid plan.",
  },
  {
    q: "Can I use KodiTrack on my phone?",
    a: "KodiTrack is a responsive web app that can be installed from supported browsers. You need an internet connection for account data, payment records, and other server-backed features.",
  },
  {
    q: "How does M-Pesa payment tracking work?",
    a: "Record a payment and its reference in the rent ledger, or use the configured M-Pesa checkout where available. KodiTrack records the receipt and updates the charge balance; landlords should reconcile records against their M-Pesa statement.",
  },
  {
    q: "Is my data private from other landlords?",
    a: "KodiTrack is designed around landlord accounts. Please do not include tenant personal details or financial records in demo and contact requests.",
  },
  {
    q: "Can I export reports for my accountant?",
    a: "KodiTrack can export rent rolls, payment ledgers, and arrears reports as CSV. Reconcile these operational records with your bank or M-Pesa statements; KodiTrack is not a double-entry accounting package.",
  },
  {
    q: "How do I upgrade my plan?",
    a: "Upgrade seamlessly from your account settings. Your units, tenants, and payment history remain intact when moving to a higher tier.",
  },
  {
    q: "Will my plan renew automatically?",
    a: "No. Renewals are initiated manually each month. KodiTrack does not automatically charge your M-Pesa account.",
  },
];

/* ─── Component ─────────────────────────────────────────────────────── */

export function LandingPage({
  onGetStarted,
  onSignIn,
  onSelectPlan,
  onNavigateContact,
}: LandingPageProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [demoSubmitting, setDemoSubmitting] = useState(false);
  const [demoSubmitted, setDemoSubmitted] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [demoName, setDemoName] = useState("");
  const [demoEmail, setDemoEmail] = useState("");
  const [demoPhone, setDemoPhone] = useState("");
  const [demoUnits, setDemoUnits] = useState("10");
  const [demoLocation, setDemoLocation] = useState("Nairobi");
  const [demoNotes, setDemoNotes] = useState("");
  const [checkoutPlan, setCheckoutPlan] = useState<"starter" | "plus" | "manager" | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Track scroll for header background transition
  useEffect(() => {
    const container = scrollContainerRef.current;
    const checkScroll = () => {
      const top = (container ? container.scrollTop : 0) || window.scrollY || document.documentElement.scrollTop;
      setHeaderScrolled(top > 24);
    };
    if (container) {
      container.addEventListener("scroll", checkScroll, { passive: true });
    }
    window.addEventListener("scroll", checkScroll, { passive: true });
    return () => {
      if (container) container.removeEventListener("scroll", checkScroll);
      window.removeEventListener("scroll", checkScroll);
    };
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);

  function handlePlanClick(planId: string) {
    if (planId === "starter" || planId === "plus" || planId === "manager") {
      setCheckoutPlan(planId);
      return;
    }
    if (onSelectPlan) onSelectPlan(planId);
    else {
      window.history.pushState(null, "", `/register?plan=${planId}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }

  function goContact() {
    if (onNavigateContact) onNavigateContact();
    else {
      window.history.pushState(null, "", "/contact");
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }

  function scrollTo(id: string) {
    setMobileMenuOpen(false);
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleDemoSubmit(e: React.FormEvent) {
    e.preventDefault();
    setDemoError(null);
    setDemoSubmitting(true);
    try {
      const res = await fetch("/api/demo-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: demoName, email: demoEmail, phone: demoPhone,
          units: parseInt(demoUnits, 10) || 5, location: demoLocation, notes: demoNotes,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Submission failed.");
      }
      setDemoSubmitted(true);
    } catch (err) { setDemoError((err as Error).message); }
    finally { setDemoSubmitting(false); }
  }

  /* ─── NAV LINKS ───────────────────────────────────────────────── */
  const navLinks = [
    { label: "Features", action: () => scrollTo("features") },
    { label: "How It Works", action: () => scrollTo("how-it-works") },
    { label: "Pricing", action: () => scrollTo("pricing") },
    { label: "FAQ", action: () => scrollTo("faq") },
    { label: "Contact", action: () => scrollTo("contact") },
  ];

  return (
    <div ref={scrollContainerRef} className="h-full overflow-y-auto scroll-smooth" style={{ scrollPaddingTop: "4.5rem" }}>
      {/* ════════════════════════════════════════════════════════════════
          HEADER — position: sticky, transparent → solid on scroll
         ════════════════════════════════════════════════════════════════ */}
      <header
        className={`sticky top-0 z-50 w-full transition-all duration-300 ${
          headerScrolled
            ? "bg-white/95 backdrop-blur-md border-b border-stone-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
            : "bg-transparent border-b border-transparent"
        }`}
      >
        <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between px-5 sm:px-8">
          {/* Logo */}
          <button
            type="button"
            onClick={() => scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#155e4f] text-white">
              <Building2 className="h-[18px] w-[18px]" />
            </div>
            <span className={`text-[1.125rem] font-bold tracking-[-0.02em] transition-colors duration-300 ${
              headerScrolled ? "text-stone-900" : "text-white"
            }`}>
              KodiTrack
            </span>
          </button>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <button
                key={link.label}
                type="button"
                onClick={link.action}
                className={`px-3.5 py-2 text-[0.8125rem] font-medium rounded-lg transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  headerScrolled
                    ? "text-stone-600 hover:text-stone-900 hover:bg-stone-100"
                    : "text-white/80 hover:text-white hover:bg-white/10"
                }`}
              >
                {link.label}
              </button>
            ))}
          </nav>

          {/* Desktop actions */}
          <div className="hidden lg:flex items-center gap-3">
            <button
              type="button"
              onClick={onSignIn}
              className={`px-3.5 py-2 text-[0.8125rem] font-medium rounded-lg transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                headerScrolled
                  ? "text-stone-700 hover:text-stone-900 hover:bg-stone-100"
                  : "text-white/90 hover:text-white hover:bg-white/10"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setDemoModalOpen(true)}
              className="h-9 px-4 text-[0.8125rem] font-semibold rounded-lg bg-[#155e4f] text-white hover:bg-[#0f4a3e] transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Book a Demo
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={`lg:hidden flex h-10 w-10 items-center justify-center rounded-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              headerScrolled ? "text-stone-700 hover:bg-stone-100" : "text-white hover:bg-white/10"
            }`}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile menu panel */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-white border-t border-stone-200 shadow-lg">
            <div className="px-5 py-4 space-y-1">
              {navLinks.map((link) => (
                <button
                  key={link.label}
                  type="button"
                  onClick={link.action}
                  className="block w-full text-left px-3 py-2.5 text-[0.9375rem] font-medium text-stone-700 hover:text-stone-900 hover:bg-stone-50 rounded-lg transition-colors"
                >
                  {link.label}
                </button>
              ))}
              <div className="pt-3 border-t border-stone-100 mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => { setMobileMenuOpen(false); onSignIn(); }}
                  className="w-full py-2.5 text-[0.9375rem] font-medium text-stone-700 hover:bg-stone-50 rounded-lg transition-colors"
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => { setMobileMenuOpen(false); setDemoModalOpen(true); }}
                  className="w-full py-2.5 text-[0.9375rem] font-semibold text-white bg-[#155e4f] hover:bg-[#0f4a3e] rounded-lg transition-colors"
                >
                  Book a Demo
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ════════════════════════════════════════════════════════════════
          HERO — Full-width architectural photograph with editorial layout
         ════════════════════════════════════════════════════════════════ */}
      <section className="relative -mt-[4.5rem] pt-[4.5rem] bg-[#0c2e25] overflow-hidden">
        {/* Background photograph */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1920&q=85')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0c2e25]/95 via-[#0c2e25]/85 to-[#0c2e25]/60" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0c2e25] via-transparent to-transparent opacity-40" />

        <div className="relative z-10 mx-auto max-w-7xl px-5 sm:px-8 py-20 sm:py-28 lg:py-36">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left: Messaging */}
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[0.75rem] font-medium text-emerald-200 mb-6">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Rental operations, organized in one place
              </div>

              <h1 className="text-[2.25rem] sm:text-[3rem] lg:text-[3.5rem] font-extrabold tracking-[-0.03em] text-white leading-[1.08] mb-5">
                Effortless Property &
                <br className="hidden sm:block" />
                Rent Management.
              </h1>

              <p className="text-[1.0625rem] sm:text-lg text-stone-300 leading-relaxed mb-8 max-w-lg">
                Keep property, tenant, lease, rent, payment and maintenance records together—so you can see what is due, what has been recorded, and what needs attention.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mb-8">
                <button
                  type="button"
                  onClick={() => scrollTo("pricing")}
                  className="inline-flex items-center justify-center h-12 px-6 text-[0.9375rem] font-semibold rounded-xl bg-white text-[#155e4f] hover:bg-stone-100 transition-colors duration-200 shadow-lg shadow-black/10 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Explore plans
                  <ArrowRight className="ml-2 h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDemoModalOpen(true)}
                  className="inline-flex items-center justify-center h-12 px-6 text-[0.9375rem] font-semibold rounded-xl border border-white/20 text-white hover:bg-white/10 transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Calendar className="mr-2 h-[18px] w-[18px]" />
                  Book a Demo
                </button>
                <button
                  type="button"
                  onClick={() => scrollTo("pricing")}
                  className="inline-flex items-center justify-center h-12 px-4 text-[0.875rem] font-medium text-stone-300 hover:text-white transition-colors duration-200 outline-none"
                >
                  View Pricing →
                </button>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-2 text-[0.8125rem] text-stone-400">
                <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-400" />Property and tenant records</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-400" />Rent receipts and clear balances</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-400" />Maintenance work orders</span>
              </div>
            </div>

            {/* Right: Product interface preview */}
            <div className="w-full max-w-lg mx-auto lg:max-w-none mt-10 lg:mt-0">
              <div className="relative">
                {/* Browser chrome */}
                <div className="rounded-2xl border border-white/10 bg-[#111614]/90 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden">
                  {/* Window bar */}
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-white/8">
                    <div className="flex gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full bg-white/15" />
                      <div className="h-2.5 w-2.5 rounded-full bg-white/15" />
                      <div className="h-2.5 w-2.5 rounded-full bg-white/15" />
                    </div>
                    <div className="flex-1 flex justify-center">
                      <div className="px-4 py-1 rounded-md bg-white/5 text-[0.6875rem] text-stone-400 font-mono">
                        KodiTrack · portfolio dashboard
                      </div>
                    </div>
                  </div>

                  {/* Dashboard content */}
                  <div className="p-5 space-y-4">
                    {/* Metrics row */}
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[0.8125rem] font-semibold text-white">Sunrise Apartments</span>
                      <span className="text-[0.6875rem] text-emerald-400 font-medium">Sample dashboard</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-xl bg-white/5 border border-white/8 p-3">
                        <div className="text-[0.625rem] text-stone-400 uppercase tracking-wider font-semibold">Occupancy</div>
                        <div className="text-xl font-bold text-white mt-0.5">94%</div>
                        <div className="text-[0.6875rem] text-emerald-400 mt-0.5">15/16 units</div>
                      </div>
                      <div className="rounded-xl bg-white/5 border border-white/8 p-3">
                        <div className="text-[0.625rem] text-stone-400 uppercase tracking-wider font-semibold">Collected</div>
                        <div className="text-xl font-bold text-white mt-0.5">KSh 745k</div>
                        <div className="text-[0.6875rem] text-stone-400 mt-0.5">This cycle</div>
                      </div>
                      <div className="rounded-xl bg-white/5 border border-white/8 p-3">
                        <div className="text-[0.625rem] text-stone-400 uppercase tracking-wider font-semibold">Arrears</div>
                        <div className="text-xl font-bold text-amber-300 mt-0.5">KSh 45k</div>
                        <div className="text-[0.6875rem] text-stone-400 mt-0.5">1 pending</div>
                      </div>
                    </div>

                    {/* Transactions */}
                    <div className="space-y-2">
                      <div className="text-[0.6875rem] text-stone-400 font-semibold uppercase tracking-wider">Recent Collections</div>
                      {[
                        { unit: "Unit A1", tenant: "Sample tenant", amount: "25,000", ref: "Receipt recorded", status: "Paid" },
                        { unit: "Unit B2", tenant: "Sample tenant", amount: "18,000", ref: "Balance KSh 7,000", status: "Partial" },
                        { unit: "Unit C1", tenant: "Sample tenant", amount: "0", ref: "Due this month", status: "Due" },
                      ].map((tx) => (
                        <div key={tx.unit} className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.03] border border-white/5">
                          <div>
                            <div className="text-[0.8125rem] font-medium text-white">{tx.unit} · {tx.tenant}</div>
                            <div className="text-[0.6875rem] text-stone-400">KSh {tx.amount} · {tx.ref}</div>
                          </div>
                          <span className={`text-[0.625rem] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            tx.status === "Paid"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          }`}>{tx.status}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-center text-[0.6875rem] text-stone-500">Illustrative preview using sample figures.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          PROPERTY TYPES — Visual banner
         ════════════════════════════════════════════════════════════════ */}
      <section className="py-16 sm:py-20 bg-stone-50 border-b border-stone-200/60">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="text-center mb-12">
            <p className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[#155e4f] mb-2">Works for every setup</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-[-0.02em] text-stone-900">
              From single rentals to multi-building portfolios
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { img: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=900&q=80", title: "Apartment blocks", alt: "Modern multi-storey apartment building", desc: "Organize each building, rental unit, tenant, lease and rent charge in one portfolio." },
              { img: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80", title: "Homes and townhouses", alt: "Contemporary rental home", desc: "Keep lease dates, rent amounts, payment records and maintenance notes easy to find." },
              { img: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=900&q=80", title: "Growing portfolios", alt: "Residential property with landscaped grounds", desc: "See multiple properties together, with unit and occupancy details available when you need them." },
            ].map((card) => (
              <div key={card.title} className="group rounded-xl overflow-hidden bg-white border border-stone-200 shadow-sm hover:shadow-md transition-shadow duration-300">
                <div className="overflow-hidden h-44">
                  <img src={card.img} alt={card.alt} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                </div>
                <div className="p-5">
                  <h3 className="text-[0.9375rem] font-bold text-stone-900">{card.title}</h3>
                  <p className="text-[0.8125rem] text-stone-500 mt-1 leading-relaxed">{card.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          FEATURES — Alternating layout for visual interest
         ════════════════════════════════════════════════════════════════ */}
      <section id="features" className="py-20 sm:py-28 bg-white">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[#155e4f] mb-2">Core Capabilities</p>
            <h2 className="text-2xl sm:text-[2rem] font-bold tracking-[-0.02em] text-stone-900">
              Everything landlords need to stay in control
            </h2>
            <p className="text-[0.9375rem] text-stone-500 mt-3 leading-relaxed">
              Follow the everyday workflow from setting up a unit to reviewing rent records and open repairs.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10">
            {[
              { icon: Receipt, title: "Payment records and receipts", desc: "Record the amount received, payment method, date and reference. Open a printable receipt with the charge and balance details." },
              { icon: AlertTriangle, title: "Arrears visibility", desc: "Review open, partially paid and overdue rent charges so you can follow up using your own process." },
              { icon: FileSpreadsheet, title: "CSV reports", desc: "Export rent rolls, payment history and arrears for review or reconciliation with your bank and M-Pesa statements." },
              { icon: Layers, title: "Monthly rent charges", desc: "Generate rent charges for active leases and review them period by period before or after collecting rent." },
              { icon: Wrench, title: "Maintenance work orders", desc: "Create and track repair tasks, connect them with a property or unit, and keep vendor details on hand." },
              { icon: ShieldCheck, title: "Lease-scoped rent credits", desc: "If a receipt exceeds the selected charge, keep the surplus visible as credit and apply it to that lease's oldest unpaid rent." },
            ].map((feat) => {
              const Icon = feat.icon;
              return (
                <div key={feat.title} className="group">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#155e4f]/8 text-[#155e4f] mb-4 group-hover:bg-[#155e4f]/12 transition-colors duration-200">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-[0.9375rem] font-bold text-stone-900 mb-1.5">{feat.title}</h3>
                  <p className="text-[0.8125rem] text-stone-500 leading-relaxed">{feat.desc}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-16 grid gap-8 lg:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-50">
              <div className="border-b border-stone-200 bg-white px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#155e4f]">Rent ledger preview</p>
                <h3 className="mt-1 text-lg font-bold text-stone-900">Understand each balance</h3>
                <p className="mt-1 text-sm leading-relaxed text-stone-500">Compare rent charged, cash received, any lease credit applied, and the amount still outstanding.</p>
              </div>
              <div className="p-5">
                <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                  <div className="grid grid-cols-4 gap-2 border-b bg-stone-100 px-3 py-2 text-[0.625rem] font-bold uppercase tracking-wide text-stone-500 sm:grid-cols-5">
                    <span>Unit</span><span>Charge</span><span>Cash</span><span>Credit</span><span className="hidden sm:block">Balance</span>
                  </div>
                  {[
                    { unit: "A1", charge: "25,000", cash: "25,000", credit: "0", balance: "0" },
                    { unit: "B2", charge: "25,000", cash: "18,000", credit: "0", balance: "7,000" },
                    { unit: "C1", charge: "25,000", cash: "23,000", credit: "2,000", balance: "0" },
                  ].map((row) => (
                    <div key={row.unit} className="grid grid-cols-4 gap-2 border-b border-stone-100 px-3 py-3 text-xs last:border-0 sm:grid-cols-5">
                      <span className="font-semibold text-stone-800">{row.unit}</span>
                      <span className="text-stone-600">{row.charge}</span>
                      <span className="text-stone-600">{row.cash}</span>
                      <span className="text-stone-600">{row.credit}</span>
                      <span className="hidden font-semibold text-stone-800 sm:block">{row.balance}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[0.6875rem] text-stone-400">Illustrative sample figures · amounts in KSh</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-50">
              <div className="border-b border-stone-200 bg-white px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#155e4f]">Maintenance preview</p>
                <h3 className="mt-1 text-lg font-bold text-stone-900">Keep repairs from getting lost</h3>
                <p className="mt-1 text-sm leading-relaxed text-stone-500">Capture the task, link it to the right property or unit, and keep its status visible.</p>
              </div>
              <div className="space-y-3 p-5">
                {[
                  { icon: Wrench, title: "Kitchen sink leak", property: "Maple Court · Unit B2", state: "In progress", tone: "bg-amber-50 text-amber-800" },
                  { icon: CheckCircle2, title: "Hallway light replacement", property: "Maple Court · Common area", state: "Completed", tone: "bg-emerald-50 text-emerald-800" },
                  { icon: Wrench, title: "Gate latch inspection", property: "Garden View · Main gate", state: "Open", tone: "bg-stone-100 text-stone-700" },
                ].map((task) => {
                  const Icon = task.icon;
                  return (
                    <div key={task.title} className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#155e4f]/8 text-[#155e4f]">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-stone-800">{task.title}</span>
                        <span className="block truncate text-xs text-stone-500">{task.property}</span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[0.625rem] font-semibold ${task.tone}`}>{task.state}</span>
                    </div>
                  );
                })}
                <p className="text-[0.6875rem] text-stone-400">Illustrative sample tasks · no customer data</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          HOW IT WORKS — Numbered steps
         ════════════════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="py-20 sm:py-28 bg-stone-50 border-y border-stone-200/60">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[#155e4f] mb-2">Getting Started</p>
            <h2 className="text-2xl sm:text-[2rem] font-bold tracking-[-0.02em] text-stone-900">
              Four steps from paper receipts to organized records
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { step: "01", title: "Add properties and units", desc: "Set up buildings, rental units, tenants and lease terms so the portfolio has a consistent record." },
              { step: "02", title: "Create monthly rent charges", desc: "Generate charges for active leases, then review each period and due date." },
              { step: "03", title: "Record payments", desc: "Enter the amount, date, method and payment reference. View or print a receipt from the ledger." },
              { step: "04", title: "Review balances and repairs", desc: "See open rent balances, export CSV reports and keep maintenance work orders moving." },
            ].map((s) => (
              <div key={s.step} className="relative rounded-xl bg-white border border-stone-200 p-6 shadow-sm">
                <div className="text-[2rem] font-extrabold text-[#155e4f]/15 leading-none mb-3">{s.step}</div>
                <h3 className="text-[0.9375rem] font-bold text-stone-900 mb-2">{s.title}</h3>
                <p className="text-[0.8125rem] text-stone-500 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          PRICING — Clean 4-column grid
         ════════════════════════════════════════════════════════════════ */}
      <section id="pricing" className="py-20 sm:py-28 bg-white">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[#155e4f] mb-2">Transparent Pricing</p>
            <h2 className="text-2xl sm:text-[2rem] font-bold tracking-[-0.02em] text-stone-900">
              Plans that fit your portfolio
            </h2>
            <p className="text-[0.9375rem] text-stone-500 mt-3">
              Choose a monthly plan based on both property count and rental units.
            </p>
            <p className="text-sm text-stone-500 mt-2">
              All plans include the current feature set. Limits apply to both properties and units; renewals are manual.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
            {PRICING.map((tier) => (
              <div
                key={tier.id}
                className={`relative flex flex-col rounded-xl border p-6 transition-shadow duration-200 ${
                  tier.popular
                    ? "border-[#155e4f] ring-1 ring-[#155e4f] shadow-md bg-white"
                    : "border-stone-200 bg-white hover:shadow-sm"
                }`}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#155e4f] px-3 py-0.5 text-[0.6875rem] font-bold text-white uppercase tracking-wider">
                    Most Popular
                  </div>
                )}

                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-bold text-stone-900">{tier.name}</h3>
                    <span className="text-[0.6875rem] font-semibold text-[#155e4f] bg-[#155e4f]/8 px-2 py-0.5 rounded-full">{tier.properties} properties · {tier.units} units</span>
                  </div>
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-[0.8125rem] text-stone-500">KSh</span>
                    <span className="text-[2rem] font-extrabold tracking-[-0.02em] text-stone-900">{tier.price}</span>
                    <span className="text-[0.8125rem] text-stone-500">{tier.period}</span>
                  </div>
                  <p className="text-[0.8125rem] text-stone-500 mt-2 leading-relaxed">{tier.description}</p>
                </div>

                <div className="flex-1 space-y-2.5 mb-6">
                  {tier.features.map((f) => (
                    <div key={f} className="flex items-start gap-2 text-[0.8125rem] text-stone-600">
                      <Check className="h-4 w-4 shrink-0 text-[#155e4f] mt-0.5" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => handlePlanClick(tier.id)}
                  className={`w-full h-10 rounded-lg text-[0.8125rem] font-semibold transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    tier.popular
                      ? "bg-[#155e4f] text-white hover:bg-[#0f4a3e]"
                      : "bg-stone-900 text-white hover:bg-stone-800"
                  }`}
                >
                  {tier.cta}
                </button>
                <p className="text-[0.6875rem] text-center text-stone-400 mt-2">{tier.note}</p>
              </div>
            ))}
          </div>

          {/* Enterprise CTA */}
          <div className="mt-10 text-center rounded-xl border border-stone-200 bg-stone-50 p-6 max-w-xl mx-auto">
            <p className="text-[0.9375rem] font-semibold text-stone-900">Need more than 30 properties or 100 units?</p>
            <p className="text-[0.8125rem] text-stone-500 mt-1 mb-4">Talk to us about a portfolio beyond the published plan limits.</p>
            <div className="flex items-center justify-center gap-3">
              <button type="button" onClick={() => setDemoModalOpen(true)} className="text-[0.8125rem] font-medium text-stone-700 hover:text-stone-900 underline underline-offset-2 decoration-stone-300 hover:decoration-stone-500 transition-colors">
                Schedule a call
              </button>
              <span className="text-stone-300">|</span>
              <button type="button" onClick={goContact} className="text-[0.8125rem] font-medium text-[#155e4f] hover:underline transition-colors">
                Contact us
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          FAQ — Clean accordion
         ════════════════════════════════════════════════════════════════ */}
      <section id="faq" className="py-20 sm:py-28 bg-stone-50 border-t border-stone-200/60">
        <div className="mx-auto max-w-2xl px-5 sm:px-8">
          <div className="text-center mb-12">
            <p className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[#155e4f] mb-2">FAQ</p>
            <h2 className="text-2xl sm:text-[2rem] font-bold tracking-[-0.02em] text-stone-900">
              Common questions
            </h2>
          </div>

          <div className="space-y-2">
            {FAQS.map((faq, idx) => (
              <div key={idx} className="rounded-xl border border-stone-200 bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="flex w-full items-center justify-between p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <span className="text-[0.9375rem] font-semibold text-stone-900 pr-4">{faq.q}</span>
                  {openFaq === idx
                    ? <ChevronUp className="h-4 w-4 text-stone-400 shrink-0" />
                    : <ChevronDown className="h-4 w-4 text-stone-400 shrink-0" />
                  }
                </button>
                {openFaq === idx && (
                  <div className="px-4 pb-4 text-[0.8125rem] text-stone-500 leading-relaxed border-t border-stone-100 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          CONTACT & INQUIRIES SECTION
         ════════════════════════════════════════════════════════════════ */}
      <section id="contact" className="py-20 sm:py-28 bg-white border-t border-stone-200/60">
        <div className="mx-auto max-w-5xl px-5 sm:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <p className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[#155e4f] mb-2">Get In Touch</p>
            <h2 className="text-2xl sm:text-[2rem] font-bold tracking-[-0.02em] text-stone-900">
              Have questions or need assistance?
            </h2>
            <p className="text-[0.9375rem] text-stone-500 mt-2">
              Speak directly with our team. We are here to help you get your properties and units set up smoothly.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-8 items-start">
            <div className="md:col-span-2 rounded-2xl bg-stone-50 border border-stone-200/80 p-6 space-y-5">
              <div>
                <h3 className="text-base font-bold text-stone-900">Direct Contact</h3>
                <p className="text-xs text-stone-500 mt-1">For time-sensitive questions, contact us directly by email or phone.</p>
              </div>

              <div className="space-y-4 text-xs text-stone-600">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-[#155e4f]/10 text-[#155e4f] flex items-center justify-center shrink-0">
                    <Mail className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-stone-900">Email Us</div>
                    <a href="mailto:jamesbriandungu@gmail.com" className="text-[#155e4f] font-medium hover:underline">
                      jamesbriandungu@gmail.com
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-[#155e4f]/10 text-[#155e4f] flex items-center justify-center shrink-0">
                    <PhoneCall className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-stone-900">Direct Consultation</div>
                    <div>Schedule a 15-minute phone or WhatsApp walkthrough</div>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-[#155e4f]/10 text-[#155e4f] flex items-center justify-center shrink-0">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-stone-900">Account-based records</div>
                    <div>Tenant and portfolio records are associated with your signed-in landlord account.</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="md:col-span-3 rounded-2xl bg-white border border-stone-200 p-6 shadow-sm">
              <form onSubmit={handleDemoSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="contactName" className="text-xs font-semibold text-stone-700">Full Name</Label>
                    <Input
                      id="contactName"
                      required
                      placeholder="e.g. Peter Njoroge"
                      value={demoName}
                      onChange={(e) => setDemoName(e.target.value)}
                      className="mt-1 text-xs"
                    />
                  </div>
                  <div>
                    <Label htmlFor="contactEmail" className="text-xs font-semibold text-stone-700">Email Address</Label>
                    <Input
                      id="contactEmail"
                      type="email"
                      required
                      placeholder="landlord@example.com"
                      value={demoEmail}
                      onChange={(e) => setDemoEmail(e.target.value)}
                      className="mt-1 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="contactPhone" className="text-xs font-semibold text-stone-700">Phone / WhatsApp</Label>
                    <Input
                      id="contactPhone"
                      type="tel"
                      required
                      placeholder="0712 345 678"
                      value={demoPhone}
                      onChange={(e) => setDemoPhone(e.target.value)}
                      className="mt-1 text-xs"
                    />
                  </div>
                  <div>
                    <Label htmlFor="contactUnits" className="text-xs font-semibold text-stone-700">Rental Units</Label>
                    <select
                      id="contactUnits"
                      value={demoUnits}
                      onChange={(e) => setDemoUnits(e.target.value)}
                      className="mt-1 w-full h-7 rounded-sm bg-card px-2 text-xs text-foreground shadow-edge outline-none focus:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_var(--brand-tint)]"
                    >
                      <option value="15">1–15 units</option>
                      <option value="50">16–50 units</option>
                      <option value="100">51–100 units</option>
                      <option value="101">More than 100 units</option>
                    </select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="contactNotes" className="text-xs font-semibold text-stone-700">Message or Inquiries</Label>
                  <textarea
                    id="contactNotes"
                    rows={3}
                    placeholder="Tell us about your rental properties or any questions you have..."
                    value={demoNotes}
                    onChange={(e) => setDemoNotes(e.target.value)}
                    className="mt-1 w-full rounded-md border border-input bg-card p-3 text-xs text-foreground shadow-xs outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                {demoSubmitted ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                    <p className="text-xs font-bold text-emerald-900">Message Received!</p>
                    <p className="text-[11px] text-emerald-700 mt-0.5">Thank you, {demoName}. We will contact you at {demoPhone} shortly.</p>
                  </div>
                ) : (
                  <button
                    type="submit"
                    disabled={demoSubmitting}
                    className="w-full h-10 rounded-lg bg-[#155e4f] text-white font-semibold text-xs hover:bg-[#0f4a3e] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {demoSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    <span>Send Message</span>
                  </button>
                )}
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          FINAL CTA
         ════════════════════════════════════════════════════════════════ */}
      <section className="py-20 sm:py-24 bg-[#0c2e25] text-white">
        <div className="mx-auto max-w-3xl px-5 sm:px-8 text-center">
          <h2 className="text-2xl sm:text-[2rem] font-bold tracking-[-0.02em] mb-4">
            Ready to organize your rental operations?
          </h2>
          <p className="text-[0.9375rem] text-stone-300 leading-relaxed mb-8 max-w-lg mx-auto">
            Choose a plan for your property and unit count, or book a walkthrough to see the workflow.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => setDemoModalOpen(true)}
              className="inline-flex items-center justify-center h-12 px-7 text-[0.9375rem] font-semibold rounded-xl bg-white text-[#155e4f] hover:bg-stone-100 transition-colors duration-200 shadow-lg shadow-black/10"
            >
              <PhoneCall className="mr-2 h-[18px] w-[18px]" />
              Book a Demo
            </button>
            <button
              type="button"
              onClick={onGetStarted}
              className="inline-flex items-center justify-center h-12 px-7 text-[0.9375rem] font-semibold rounded-xl border border-white/20 text-white hover:bg-white/10 transition-colors duration-200"
            >
              Create an account
            </button>
          </div>
          <p className="mt-6 text-[0.8125rem] text-stone-400">
            Questions? Email{" "}
            <a href="mailto:jamesbriandungu@gmail.com" className="text-emerald-300 hover:underline">jamesbriandungu@gmail.com</a>
          </p>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          FOOTER
         ════════════════════════════════════════════════════════════════ */}
      <footer className="border-t border-stone-200 bg-white py-10">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#155e4f] text-white">
                <Building2 className="h-4 w-4" />
              </div>
              <div>
                <span className="text-[0.875rem] font-bold text-stone-900">KodiTrack</span>
                <span className="text-[0.75rem] text-stone-400 ml-2">Modern rental property management</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[0.8125rem] text-stone-500">
              <button type="button" onClick={() => scrollTo("features")} className="hover:text-stone-900 transition-colors">Features</button>
              <button type="button" onClick={() => scrollTo("pricing")} className="hover:text-stone-900 transition-colors">Pricing</button>
              <button type="button" onClick={() => scrollTo("faq")} className="hover:text-stone-900 transition-colors">FAQ</button>
              <button type="button" onClick={() => scrollTo("contact")} className="hover:text-stone-900 transition-colors">Contact</button>
              <button type="button" onClick={onSignIn} className="hover:text-stone-900 transition-colors">Sign In</button>
              <a href="mailto:jamesbriandungu@gmail.com" className="text-[#155e4f] font-medium hover:underline">jamesbriandungu@gmail.com</a>
            </div>
          </div>
          <div className="mt-6 pt-6 border-t border-stone-100 text-[0.75rem] text-stone-400">
            © {new Date().getFullYear()} KodiTrack. Designed for modern landlords and property managers.
          </div>
        </div>
      </footer>

      {/* ════════════════════════════════════════════════════════════════
          DEMO MODAL
         ════════════════════════════════════════════════════════════════ */}
      {demoModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl text-stone-900 max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => { setDemoModalOpen(false); setDemoSubmitted(false); }}
              className="absolute top-4 right-4 text-stone-400 hover:text-stone-700 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              <X className="h-5 w-5" />
            </button>

            {demoSubmitted ? (
              <div className="text-center py-6 space-y-4">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#155e4f]/10 text-[#155e4f]">
                  <Check className="h-7 w-7" />
                </div>
                <h3 className="text-lg font-bold text-stone-900">Demo Request Received</h3>
                <p className="text-[0.8125rem] text-stone-500 leading-relaxed">
                  Thank you, <strong className="text-stone-900">{demoName}</strong>. Your request has been saved. Please contact us directly if you need to arrange a time-sensitive demo.
                </p>
                <button
                  type="button"
                  onClick={() => { setDemoModalOpen(false); setDemoSubmitted(false); }}
                  className="w-full h-10 rounded-lg bg-[#155e4f] text-white font-semibold text-[0.8125rem] hover:bg-[#0f4a3e] transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#155e4f] text-white">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-stone-900">Book a KodiTrack Demo</h3>
                    <p className="text-[0.6875rem] text-[#155e4f] font-semibold">15-minute walkthrough with our team</p>
                  </div>
                </div>

                {demoError && (
                  <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-2.5 text-[0.8125rem] text-red-700">{demoError}</div>
                )}

                <form onSubmit={handleDemoSubmit} className="space-y-3">
                  <div>
                    <Label htmlFor="demoName" className="text-[0.8125rem] font-semibold text-stone-700">Full Name</Label>
                    <Input id="demoName" required placeholder="Peter Njoroge" value={demoName} onChange={(e) => setDemoName(e.target.value)} className="mt-1 text-[0.8125rem]" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="demoPhone" className="text-[0.8125rem] font-semibold text-stone-700">Phone / WhatsApp</Label>
                      <Input id="demoPhone" required type="tel" placeholder="0712 345 678" value={demoPhone} onChange={(e) => setDemoPhone(e.target.value)} className="mt-1 text-[0.8125rem]" />
                    </div>
                    <div>
                      <Label htmlFor="demoUnits" className="text-[0.8125rem] font-semibold text-stone-700">Units</Label>
                      <select id="demoUnits" value={demoUnits} onChange={(e) => setDemoUnits(e.target.value)}
                        className="mt-1 w-full h-7 rounded-sm bg-card px-2 text-[0.8125rem] text-foreground shadow-edge outline-none focus:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_var(--brand-tint)]">
                        <option value="15">1–15 units</option>
                        <option value="50">16–50 units</option>
                        <option value="100">51–100 units</option>
                        <option value="101">More than 100 units</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="demoEmail" className="text-[0.8125rem] font-semibold text-stone-700">Email</Label>
                    <Input id="demoEmail" required type="email" placeholder="landlord@example.com" value={demoEmail} onChange={(e) => setDemoEmail(e.target.value)} className="mt-1 text-[0.8125rem]" />
                  </div>
                  <div>
                    <Label htmlFor="demoLocation" className="text-[0.8125rem] font-semibold text-stone-700">Location</Label>
                    <Input id="demoLocation" placeholder="Kilimani, Nairobi" value={demoLocation} onChange={(e) => setDemoLocation(e.target.value)} className="mt-1 text-[0.8125rem]" />
                  </div>
                  <div>
                    <Label htmlFor="demoNotes" className="text-[0.8125rem] font-semibold text-stone-700">Pain point (optional)</Label>
                    <Input id="demoNotes" placeholder="e.g. Tracking partial rent payments" value={demoNotes} onChange={(e) => setDemoNotes(e.target.value)} className="mt-1 text-[0.8125rem]" />
                  </div>
                  <button
                    type="submit"
                    disabled={demoSubmitting}
                    className="w-full h-10 rounded-lg bg-[#155e4f] text-white font-semibold text-[0.8125rem] hover:bg-[#0f4a3e] transition-colors disabled:opacity-50 mt-1 flex items-center justify-center"
                  >
                    {demoSubmitting
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</>
                      : "Confirm Demo Booking"
                    }
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* M-Pesa Checkout Modal for Plan Subscriptions */}
      {checkoutPlan && (
        <MpesaCheckoutModal
          isOpen={Boolean(checkoutPlan)}
          planId={checkoutPlan}
          onClose={() => setCheckoutPlan(null)}
          onSuccess={() => {
            setCheckoutPlan(null);
            window.location.href = "/dashboard";
          }}
        />
      )}
    </div>
  );
}
