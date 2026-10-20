import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  Clock,
  CheckCircle2,
  ArrowLeft,
  Loader2,
  Send,
  ShieldCheck,
} from "lucide-react";

interface ContactPageProps {
  navigate: (to: string) => void;
}

export function ContactPage({ navigate }: ContactPageProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [units, setUnits] = useState("10");
  const [inquiryType, setInquiryType] = useState("general_inquiry");
  const [location, setLocation] = useState("Nairobi");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/demo-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, email, phone,
          units: parseInt(units, 10) || 5,
          portfolio_type: inquiryType,
          location,
          notes: message
            ? `[${inquiryType.toUpperCase()}] ${message}`
            : `[${inquiryType.toUpperCase()}] Inquiry via Contact page.`,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Submission failed. Please email us directly.");
      }
      setSubmitted(true);
    } catch (err) { setError((err as Error).message); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex flex-col font-sans">
      {/* Header */}
      <header className="sticky top-0 z-40 w-full border-b border-stone-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#155e4f] text-white">
              <Building2 className="h-[18px] w-[18px]" />
            </div>
            <span className="text-[1.125rem] font-bold tracking-[-0.02em] text-stone-900">KodiTrack</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="inline-flex items-center text-[0.8125rem] font-medium text-stone-600 hover:text-stone-900 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg px-3 py-2"
            >
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Home
            </button>
            <button
              type="button"
              onClick={() => navigate("/pricing")}
              className="hidden sm:inline-flex h-9 px-4 items-center text-[0.8125rem] font-semibold rounded-lg bg-[#155e4f] text-white hover:bg-[#0f4a3e] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Pricing (1–3 Free)
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          {/* Page heading */}
          <div className="max-w-2xl mb-12">
            <p className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-[#155e4f] mb-2">Contact Us</p>
            <h1 className="text-[2rem] sm:text-[2.5rem] font-bold tracking-[-0.03em] text-stone-900 leading-tight">
              Let's talk about your rental portfolio.
            </h1>
            <p className="text-[0.9375rem] text-stone-500 mt-3 leading-relaxed max-w-lg">
              Whether you have questions about onboarding, M-Pesa tracking, or enterprise licensing — we're here to help.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            {/* Left: Contact information */}
            <div className="lg:col-span-4 space-y-5">
              {/* Email card */}
              <div className="rounded-xl border border-[#155e4f]/20 bg-[#155e4f]/[0.03] p-5">
                <div className="flex items-start gap-3.5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#155e4f] text-white">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-[#155e4f]">Email</p>
                    <a
                      href="mailto:jamesbriandungu@gmail.com?subject=KodiTrack%20Inquiry"
                      className="text-[0.9375rem] font-bold text-stone-900 hover:text-[#155e4f] transition-colors break-all"
                    >
                      jamesbriandungu@gmail.com
                    </a>
                    <p className="text-[0.8125rem] text-stone-500 mt-1">Product inquiries, onboarding, technical help</p>
                  </div>
                </div>
              </div>

              {/* Other contact methods */}
              <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-600">
                    <Phone className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[0.8125rem] font-semibold text-stone-900">Phone & WhatsApp</p>
                    <p className="text-[0.8125rem] text-stone-500">+254 712 345 678</p>
                  </div>
                </div>

                <div className="border-t border-stone-100 pt-4 flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-600">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[0.8125rem] font-semibold text-stone-900">Nairobi, Kenya</p>
                    <p className="text-[0.8125rem] text-stone-500">Kilimani / Westlands area</p>
                  </div>
                </div>

                <div className="border-t border-stone-100 pt-4 flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-600">
                    <Clock className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[0.8125rem] font-semibold text-stone-900">Contact hours</p>
                    <p className="text-[0.8125rem] text-stone-500">Mon–Sat, 8 AM – 6 PM EAT</p>
                  </div>
                </div>
              </div>

              {/* Trust note */}
              <div className="flex items-start gap-3 rounded-xl border border-stone-200 bg-white p-4">
                <ShieldCheck className="h-5 w-5 text-[#155e4f] shrink-0 mt-0.5" />
                <p className="text-[0.8125rem] text-stone-500 leading-relaxed">
                  <strong className="text-stone-700">Protect tenant privacy.</strong> Please do not include tenant personal details or financial records in this form.
                </p>
              </div>
            </div>

            {/* Right: Inquiry form */}
            <div className="lg:col-span-8">
              <div className="rounded-xl border border-stone-200 bg-white p-6 sm:p-8 shadow-sm">
                {submitted ? (
                  <div className="py-12 text-center space-y-4">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#155e4f]/10 text-[#155e4f]">
                      <CheckCircle2 className="h-7 w-7" />
                    </div>
                    <h3 className="text-xl font-bold text-stone-900">Thank you, {name}!</h3>
                    <p className="text-[0.8125rem] text-stone-500 max-w-md mx-auto">
                      Your request has been saved. For a time-sensitive inquiry, contact us directly using the email or phone details on this page.
                    </p>
                    <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => { setSubmitted(false); setMessage(""); }}
                        className="text-[0.8125rem] font-medium text-stone-600 hover:text-stone-900 underline underline-offset-2 decoration-stone-300"
                      >
                        Send another inquiry
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate("/")}
                        className="h-9 px-4 text-[0.8125rem] font-semibold rounded-lg bg-[#155e4f] text-white hover:bg-[#0f4a3e] transition-colors"
                      >
                        Return Home
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mb-6">
                      <h2 className="text-lg font-bold text-stone-900">Send an inquiry</h2>
                      <p className="text-[0.8125rem] text-stone-500 mt-1">
                        Tell us about your portfolio and we'll get back to you promptly.
                      </p>
                    </div>

                    {error && (
                      <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-[0.8125rem] text-red-700">{error}</div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="cName" className="text-[0.8125rem] font-semibold text-stone-700">Full Name <span className="text-red-500">*</span></Label>
                          <Input id="cName" required placeholder="Samuel Kariuki" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 text-[0.8125rem]" />
                        </div>
                        <div>
                          <Label htmlFor="cPhone" className="text-[0.8125rem] font-semibold text-stone-700">Phone / WhatsApp <span className="text-red-500">*</span></Label>
                          <Input id="cPhone" required type="tel" placeholder="0712 345 678" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 text-[0.8125rem]" />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="cEmail" className="text-[0.8125rem] font-semibold text-stone-700">Email <span className="text-red-500">*</span></Label>
                          <Input id="cEmail" required type="email" placeholder="landlord@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 text-[0.8125rem]" />
                        </div>
                        <div>
                          <Label htmlFor="cLocation" className="text-[0.8125rem] font-semibold text-stone-700">Location</Label>
                          <Input id="cLocation" placeholder="Kilimani, Nairobi" value={location} onChange={(e) => setLocation(e.target.value)} className="mt-1 text-[0.8125rem]" />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="cUnits" className="text-[0.8125rem] font-semibold text-stone-700">Units managed</Label>
                          <select id="cUnits" value={units} onChange={(e) => setUnits(e.target.value)}
                            className="mt-1 w-full h-7 rounded-sm bg-card px-2 text-[0.8125rem] text-foreground shadow-edge outline-none focus:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_var(--brand-tint)]">
                            <option value="3">1–3 Units (Free)</option>
                            <option value="15">4–15 (Starter)</option>
                            <option value="50">16–50 (Plus)</option>
                            <option value="200">51–200 (Manager)</option>
                            <option value="500">200+ (Enterprise)</option>
                          </select>
                        </div>
                        <div>
                          <Label htmlFor="cType" className="text-[0.8125rem] font-semibold text-stone-700">Inquiry type</Label>
                          <select id="cType" value={inquiryType} onChange={(e) => setInquiryType(e.target.value)}
                            className="mt-1 w-full h-7 rounded-sm bg-card px-2 text-[0.8125rem] text-foreground shadow-edge outline-none focus:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_3px_var(--brand-tint)]">
                            <option value="general_inquiry">General question</option>
                            <option value="demo_request">Schedule a demo</option>
                            <option value="onboarding">Assisted onboarding</option>
                            <option value="commercial">Commercial license</option>
                            <option value="custom_mpesa">Custom M-Pesa integration</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="cMessage" className="text-[0.8125rem] font-semibold text-stone-700">How can we help? (optional)</Label>
                        <Textarea
                          id="cMessage" rows={4}
                          placeholder="Tell us about your properties and any challenges you're facing…"
                          value={message} onChange={(e) => setMessage(e.target.value)}
                          className="mt-1 text-[0.8125rem]"
                        />
                      </div>

                      <div className="pt-1">
                        <button
                          type="submit"
                          disabled={submitting}
                          className="w-full h-10 rounded-lg bg-[#155e4f] text-white font-semibold text-[0.8125rem] hover:bg-[#0f4a3e] transition-colors disabled:opacity-50 flex items-center justify-center"
                        >
                          {submitting
                            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</>
                            : <><Send className="mr-2 h-3.5 w-3.5" />Send Inquiry</>
                          }
                        </button>
                        <p className="text-[0.6875rem] text-center text-stone-400 mt-2">
                          Or email directly:{" "}
                          <a href="mailto:jamesbriandungu@gmail.com" className="font-medium text-[#155e4f] hover:underline">
                            jamesbriandungu@gmail.com
                          </a>
                        </p>
                      </div>
                    </form>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-200 bg-white py-8">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[0.8125rem] text-stone-500">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-[#155e4f]" />
            <span className="font-semibold text-stone-700">KodiTrack</span>
            <span>· Rental management for Kenyan landlords</span>
          </div>
          <div className="flex items-center gap-5">
            <button type="button" onClick={() => navigate("/")} className="hover:text-stone-900 transition-colors">Home</button>
            <button type="button" onClick={() => navigate("/pricing")} className="hover:text-stone-900 transition-colors">Pricing</button>
            <a href="mailto:jamesbriandungu@gmail.com" className="text-[#155e4f] font-medium hover:underline">jamesbriandungu@gmail.com</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
