import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home } from "lucide-react";
import { useApp } from "@/context";

interface NotFoundPageProps {
  navigate: (to: string) => void;
}

/* ──────────────────────────────────────────────────────────────
   Animation timeline (one 9s loop, percentages of the loop)

    0–2    person fades in at the left, standing on the ground
    2–22   walks to the door (real leg/arm swing, body bobs)
   22–36   reaches for the handle, tugs it, door rattles, padlock shakes
   40–46   steps back, frustrated
   46–59   winds up, then shoulder-charges the door
   59–66   door slams, sparks fly, person recoils
   66–80   shrugs, question marks float up
   80–100  turns around and walks away, fades out, loop restarts

   NOTE ON THE "FLYING" BUG: a CSS `transform` on an SVG element
   replaces its `transform="translate(...)"` attribute. The old
   version animated the same <g> it positioned, so the person was
   thrown to (0,0) and floated. Here every positioned <g> is an
   outer wrapper (attribute only) and the animated <g> is its child
   (CSS only), so nothing overrides anything.
   ────────────────────────────────────────────────────────────── */

type Stop = [number, string];

const T = (v: string) => `transform:${v};`;
const rot = (d: number) => T(`rotate(${d}deg)`);
const ty = (y: number) => T(`translateY(${y}px)`);
const tx = (x: number) => T(`translateX(${x}px)`);
const P = (x: number, s = 1, r = 0, o = 1) =>
  `transform:translateX(${x}px) scaleX(${s}) rotate(${r}deg);opacity:${o};`;

function keyframes(name: string, stops: Stop[]) {
  const body = [...stops]
    .sort((a, b) => a[0] - b[0])
    .map(([p, d]) => `${+p.toFixed(2)}%{${d}}`)
    .join("");
  return `@keyframes ${name}{${body}}`;
}

/** Generates a walking cycle: leg swing, arm swing and the hip dip that keeps feet on the ground. */
function gait(from: number, to: number, steps: number, amp: number, arms = true) {
  const dip = +(50 * (1 - Math.cos((amp * Math.PI) / 180))).toFixed(1);
  const out = {
    legA: [] as Stop[],
    legB: [] as Stop[],
    armF: [] as Stop[],
    armB: [] as Stop[],
    bob: [] as Stop[],
  };
  const dt = (to - from) / steps;
  for (let i = 0; i <= steps; i++) {
    const t = from + dt * i;
    const edge = i === 0 || i === steps;
    const s = edge ? 0 : i % 2 ? 1 : -1;
    out.legA.push([t, rot(s * amp)]);
    out.legB.push([t, rot(-s * amp)]);
    out.bob.push([t, ty(edge ? 0 : dip)]);
    if (arms) {
      out.armF.push([t, rot(-s * amp * 0.85)]);
      out.armB.push([t, rot(s * amp * 0.85)]);
    }
    if (!edge && i < steps - 1) out.bob.push([t + dt / 2, ty(0)]);
  }
  return out;
}

function buildCss() {
  const gaits = [
    gait(2, 22, 8, 24), // walk to the door
    gait(40, 46, 2, 14), // step back
    gait(56, 59, 2, 18, false), // lunge
    gait(60, 66, 2, 14, false), // recoil
    gait(84, 100, 6, 24), // walk away
  ];
  const all = (k: "legA" | "legB" | "armF" | "armB" | "bob") => gaits.flatMap((g) => g[k]);

  const person: Stop[] = [
    [0, P(0, 1, 0, 0)],
    [2, P(0)],
    [22, P(113)],
    [24, P(113)],
    [26, P(111, 1, -2)],
    [28, P(113)],
    [30, P(111, 1, -2)],
    [32, P(113)],
    [40, P(113)],
    [46, P(79)],
    [54, P(71, 1, -6)],
    [56, P(71, 1, -6) + "animation-timing-function:cubic-bezier(.6,0,1,.5);"],
    [59, P(116, 1, 7)],
    [60, P(116, 1, 7) + "animation-timing-function:cubic-bezier(0,.6,.4,1);"],
    [66, P(94, 1, -2)],
    [72, P(98)],
    [80, P(98)],
    [84, P(98, -1)],
    [96, P(24.5, -1, 0, 1)],
    [100, P(0, -1, 0, 0)],
  ];

  const armF: Stop[] = [
    [0, rot(0)],
    ...all("armF"),
    [24, rot(-62)],
    [26, rot(-57)],
    [28, rot(-64)],
    [30, rot(-57)],
    [32, rot(-62)],
    [36, rot(-62)],
    [54, rot(18)],
    [59, rot(40)],
    [60, rot(40)],
    [66, rot(10)],
    [70, rot(-20)],
    [73, rot(-72)],
    [75, rot(-62)],
    [77, rot(-72)],
    [80, rot(0)],
  ];
  const armB: Stop[] = [
    [0, rot(0)],
    ...all("armB"),
    [24, rot(8)],
    [36, rot(8)],
    [54, rot(18)],
    [59, rot(40)],
    [60, rot(40)],
    [66, rot(10)],
    [70, rot(-20)],
    [73, rot(-68)],
    [75, rot(-58)],
    [77, rot(-68)],
    [80, rot(0)],
  ];

  const head: Stop[] = [
    [0, rot(0)],
    [66, rot(0)],
    [70, rot(10)],
    [78, rot(10)],
    [82, rot(0)],
    [100, rot(0)],
  ];

  const door: Stop[] = [
    [0, tx(0)],
    [25, tx(0)],
    [26, tx(1.5)],
    [27, tx(-0.5)],
    [28, tx(1.5)],
    [29, tx(-0.5)],
    [30, tx(1.2)],
    [31, tx(0)],
    [58.5, tx(0)],
    [59, tx(4)],
    [60.5, tx(-3)],
    [62, tx(2)],
    [63.5, tx(-1)],
    [65, tx(0)],
    [100, tx(0)],
  ];

  const lock: Stop[] = [
    [0, rot(0)],
    [25, rot(0)],
    [26, rot(-14)],
    [27, rot(10)],
    [28, rot(-14)],
    [29, rot(10)],
    [30, rot(-10)],
    [32, rot(0)],
    [58.5, rot(0)],
    [59, rot(22)],
    [61, rot(-14)],
    [63, rot(8)],
    [65, rot(0)],
    [100, rot(0)],
  ];

  const hidden = "opacity:0;transform:translateY(6px) scale(.6);";
  const question: Stop[] = [
    [0, hidden],
    [67, hidden],
    [70, "opacity:1;transform:translateY(-4px) scale(1.1);"],
    [76, "opacity:1;transform:translateY(-10px) scale(1);"],
    [82, "opacity:0;transform:translateY(-16px) scale(.9);"],
    [100, "opacity:0;transform:translateY(-16px) scale(.9);"],
  ];

  const spark: Stop[] = [
    [0, "opacity:0;transform:scale(.3);"],
    [58.5, "opacity:0;transform:scale(.3);"],
    [59, "opacity:1;transform:scale(1.1);"],
    [62, "opacity:0;transform:scale(1.7);"],
    [100, "opacity:0;transform:scale(1.7);"],
  ];

  const dust: Stop[] = [
    [0, "opacity:0;transform:translate(0,0) scale(.4);"],
    [58.5, "opacity:0;transform:translate(0,0) scale(.4);"],
    [59.5, "opacity:.7;transform:translate(-4px,-2px) scale(1);"],
    [66, "opacity:0;transform:translate(-14px,-8px) scale(1.8);"],
    [100, "opacity:0;transform:translate(-14px,-8px) scale(1.8);"],
  ];

  return `
${keyframes("nf-person", person)}
${keyframes("nf-bob", [[0, ty(0)], ...all("bob"), [100, ty(0)]])}
${keyframes("nf-leg-a", [[0, rot(0)], ...all("legA")])}
${keyframes("nf-leg-b", [[0, rot(0)], ...all("legB")])}
${keyframes("nf-arm-f", armF)}
${keyframes("nf-arm-b", armB)}
${keyframes("nf-head", head)}
${keyframes("nf-door", door)}
${keyframes("nf-lock", lock)}
${keyframes("nf-question", question)}
${keyframes("nf-spark", spark)}
${keyframes("nf-dust", dust)}
@keyframes nf-cloud-a{from{transform:translateX(0)}to{transform:translateX(34px)}}
@keyframes nf-cloud-b{from{transform:translateX(0)}to{transform:translateX(-26px)}}
@keyframes nf-glow{0%,100%{opacity:.18}50%{opacity:.42}}

.nf-person{animation:nf-person 9s linear infinite;transform-origin:0 0}
.nf-bob{animation:nf-bob 9s linear infinite}
.nf-leg-a{animation:nf-leg-a 9s linear infinite;transform-origin:0 0}
.nf-leg-b{animation:nf-leg-b 9s linear infinite;transform-origin:0 0}
.nf-arm-f{animation:nf-arm-f 9s linear infinite;transform-origin:0 0}
.nf-arm-b{animation:nf-arm-b 9s linear infinite;transform-origin:0 0}
.nf-head{animation:nf-head 9s ease-in-out infinite;transform-origin:0 0}
.nf-door{animation:nf-door 9s linear infinite}
.nf-lock{animation:nf-lock 9s linear infinite;transform-origin:0 -8px}
.nf-q{opacity:0;animation:nf-question 9s ease-out infinite;transform-origin:0 0}
.nf-q-2{animation-delay:.18s}
.nf-spark{animation:nf-spark 9s ease-out infinite;transform-origin:0 0;opacity:0}
.nf-dust{animation:nf-dust 9s ease-out infinite;transform-origin:0 0;opacity:0}
.nf-cloud-a{animation:nf-cloud-a 16s ease-in-out infinite alternate}
.nf-cloud-b{animation:nf-cloud-b 20s ease-in-out infinite alternate}
.nf-glow{animation:nf-glow 4s ease-in-out infinite}

@media (prefers-reduced-motion: reduce){
  .nf-scene *{animation:none !important}
  .nf-person{transform:translateX(98px)}
  .nf-q{opacity:1}
}`;
}

const NF_CSS = buildCss();

const SKIN = "#e8b48a";

export function NotFoundPage({ navigate }: NotFoundPageProps) {
  const { user } = useApp();

  return (
    <div className="flex min-h-[85vh] flex-col items-center justify-center p-6 text-center select-none">
      <style>{NF_CSS}</style>

      <svg
        viewBox="0 0 420 300"
        className="nf-scene mb-6 h-64 w-auto max-w-full sm:h-72"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="A person tries a locked door, shoulder-charges it, then shrugs and walks away."
      >
        {/* Soft backdrop */}
        <ellipse cx="270" cy="185" rx="185" ry="105" fill="#99f6e4" opacity="0.22" />

        {/* Drifting clouds */}
        <g transform="translate(60 52)">
          <g className="nf-cloud-a" fill="#bae6fd" opacity="0.8">
            <ellipse cx="0" cy="0" rx="24" ry="8" />
            <ellipse cx="-9" cy="-6" rx="11" ry="8" />
            <ellipse cx="8" cy="-9" rx="13" ry="10" />
          </g>
        </g>
        <g transform="translate(372 40)">
          <g className="nf-cloud-b" fill="#bae6fd" opacity="0.65">
            <ellipse cx="0" cy="0" rx="18" ry="6" />
            <ellipse cx="-6" cy="-5" rx="8" ry="6" />
            <ellipse cx="6" cy="-6" rx="9" ry="7" />
          </g>
        </g>

        {/* Ground */}
        <rect x="10" y="270" width="400" height="6" rx="3" fill="#cbd5e1" />
        <g stroke="#5eead4" strokeWidth="2" strokeLinecap="round" fill="none">
          <path d="M34 270 q2 -9 4 0 M38 270 q3 -11 6 0" />
          <path d="M120 270 q2 -7 4 0 M124 270 q2 -9 5 0" />
          <path d="M398 270 q2 -8 4 0" />
        </g>

        {/* ── House ── */}
        <rect x="180" y="90" width="180" height="180" rx="8" fill="#f8fafc" stroke="#334155" strokeWidth="3" />
        <rect x="180" y="244" width="180" height="26" fill="#e2e8f0" />

        {/* Roof */}
        <path d="M165 92 L270 20 L375 92 Z" fill="#0f766e" stroke="#042f2e" strokeWidth="3" strokeLinejoin="round" />
        <path d="M270 20 L270 92" stroke="#115e59" strokeWidth="2" strokeDasharray="4 4" />

        {/* Chimney */}
        <rect x="320" y="35" width="22" height="35" rx="2" fill="#991b1b" stroke="#450a0a" strokeWidth="2.5" />
        <path d="M316 35 L346 35" stroke="#450a0a" strokeWidth="3" strokeLinecap="round" />

        {/* Attic window */}
        <rect x="245" y="42" width="32" height="32" rx="4" fill="#fef08a" stroke="#042f2e" strokeWidth="2.5" />
        <line x1="261" y1="42" x2="261" y2="74" stroke="#042f2e" strokeWidth="2" />
        <line x1="245" y1="58" x2="277" y2="58" stroke="#042f2e" strokeWidth="2" />

        {/* Side window */}
        <rect x="306" y="125" width="42" height="50" rx="4" fill="#bae6fd" stroke="#334155" strokeWidth="2.5" />
        <line x1="327" y1="125" x2="327" y2="175" stroke="#334155" strokeWidth="2" />
        <line x1="306" y1="150" x2="348" y2="150" stroke="#334155" strokeWidth="2" />

        {/* Porch light with a slow glow */}
        <circle className="nf-glow" cx="283" cy="152" r="16" fill="#fde68a" />
        <circle cx="283" cy="152" r="5" fill="#facc15" stroke="#713f12" strokeWidth="1.5" />

        {/* House number plate */}
        <rect x="205" y="104" width="50" height="22" rx="4" fill="#0f172a" />
        <text
          x="230"
          y="120"
          textAnchor="middle"
          fill="#f8fafc"
          fontSize="14"
          fontWeight="800"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          letterSpacing="1.5"
        >
          404
        </text>

        {/* Door frame */}
        <rect x="195" y="135" width="70" height="135" rx="3" fill="#334155" />

        {/* Door (rattles, carries the lock and handle with it) */}
        <g className="nf-door">
          <rect x="198" y="138" width="64" height="132" rx="2" fill="#0d9488" stroke="#134e4a" strokeWidth="2" />
          <rect x="204" y="146" width="22" height="46" rx="2" fill="#0f766e" />
          <rect x="234" y="146" width="22" height="46" rx="2" fill="#0f766e" />
          <rect x="204" y="202" width="22" height="58" rx="2" fill="#0f766e" />
          <rect x="234" y="202" width="22" height="58" rx="2" fill="#0f766e" />

          {/* Handle */}
          <rect x="204" y="194.5" width="13" height="3" rx="1.5" fill="#f59e0b" />
          <circle cx="207" cy="196" r="4" fill="#fbbf24" stroke="#78350f" strokeWidth="1.5" />

          {/* Padlock */}
          <g transform="translate(207 177)">
            <g className="nf-lock">
              <path d="M-4 -2 V-6 a4 4 0 0 1 8 0 V-2" stroke="#cbd5e1" strokeWidth="2.2" strokeLinecap="round" fill="none" />
              <rect x="-6.5" y="-3" width="13" height="11" rx="2.5" fill="#ef4444" stroke="#7f1d1d" strokeWidth="1.5" />
              <circle cx="0" cy="2" r="1.6" fill="#7f1d1d" />
            </g>
          </g>
        </g>

        {/* Doorstep */}
        <rect x="190" y="268" width="80" height="5" rx="1.5" fill="#64748b" />

        {/* Bush */}
        <g>
          <circle cx="372" cy="260" r="10" fill="#0f766e" />
          <circle cx="385" cy="256" r="13" fill="#14b8a6" />
          <circle cx="398" cy="262" r="8" fill="#0f766e" />
        </g>

        {/* ── Person (feet at y = 270, drawn from the feet up) ── */}
        <g transform="translate(60 270)">
          <ellipse cx="0" cy="1" rx="17" ry="3" fill="#94a3b8" opacity="0.55" />

          <g className="nf-person">
            <g className="nf-bob">
              {/* Back arm */}
              <g transform="translate(0 -90)">
                <g className="nf-arm-b">
                  <line x1="0" y1="0" x2="0" y2="30" stroke="#115e59" strokeWidth="6" strokeLinecap="round" />
                  <circle cx="0" cy="33" r="3.6" fill={SKIN} />
                </g>
              </g>

              {/* Back leg */}
              <g transform="translate(0 -50)">
                <g className="nf-leg-b">
                  <line x1="0" y1="0" x2="0" y2="44" stroke="#0f172a" strokeWidth="7" strokeLinecap="round" />
                  <rect x="-4" y="44" width="14" height="6" rx="3" fill="#0f172a" />
                </g>
              </g>

              {/* Backpack */}
              <rect x="-17" y="-90" width="9" height="28" rx="3" fill="#f59e0b" stroke="#b45309" strokeWidth="1.5" />

              {/* Torso */}
              <rect x="-10" y="-95" width="20" height="47" rx="8" fill="#0f766e" stroke="#134e4a" strokeWidth="2" />

              {/* Front leg */}
              <g transform="translate(0 -50)">
                <g className="nf-leg-a">
                  <line x1="0" y1="0" x2="0" y2="44" stroke="#1e293b" strokeWidth="7" strokeLinecap="round" />
                  <rect x="-4" y="44" width="14" height="6" rx="3" fill="#020617" />
                </g>
              </g>

              {/* Head */}
              <g transform="translate(1 -95)">
                <g className="nf-head">
                  <circle cx="0" cy="-11" r="11" fill={SKIN} stroke="#334155" strokeWidth="2" />
                  <path d="M-11 -12 C-11 -27 11 -27 11 -12 C6 -18 -4 -18 -11 -12 Z" fill="#1e293b" />
                  <circle cx="5" cy="-10" r="1.5" fill="#1e293b" />
                  <path d="M3 -4 Q6 -3 8 -5" stroke="#334155" strokeWidth="1.4" strokeLinecap="round" fill="none" />
                </g>
              </g>

              {/* Front arm (reaches for the handle, shoves, shrugs) */}
              <g transform="translate(2 -90)">
                <g className="nf-arm-f">
                  <line x1="0" y1="0" x2="0" y2="30" stroke="#0d9488" strokeWidth="6.5" strokeLinecap="round" />
                  <circle cx="0" cy="33" r="3.6" fill={SKIN} stroke="#334155" strokeWidth="1" />
                </g>
              </g>
            </g>
          </g>
        </g>

        {/* Impact: sparks and a little dust where the shoulder hits */}
        <g transform="translate(197 180)">
          <g className="nf-spark">
            <path d="M-6 -8 L-15 -15" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M-8 0 L-19 0" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M-6 8 L-15 15" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="-2" cy="0" r="4" fill="#fef08a" />
          </g>
        </g>
        <g transform="translate(184 267)">
          <g className="nf-dust" fill="#cbd5e1">
            <circle cx="0" cy="0" r="4" />
            <circle cx="-7" cy="-2" r="3" />
          </g>
        </g>

        {/* Puzzled question marks */}
        <g transform="translate(160 142)">
          <text className="nf-q" x="0" y="0" fill="#dc2626" fontSize="20" fontWeight="800" fontFamily="ui-sans-serif, system-ui, sans-serif">
            ?
          </text>
        </g>
        <g transform="translate(177 130)">
          <text className="nf-q nf-q-2" x="0" y="0" fill="#eab308" fontSize="16" fontWeight="800" fontFamily="ui-sans-serif, system-ui, sans-serif">
            ?
          </text>
        </g>
      </svg>

      <div className="max-w-sm space-y-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          Page not found
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          It may have moved, been archived, or belong to another account.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col items-center justify-center gap-3 pt-4 sm:flex-row">
          <Button
            onClick={() => navigate(user ? "/dashboard" : "/")}
            className="w-full bg-teal-700 font-medium text-white hover:bg-teal-800 sm:w-auto"
          >
            <Home className="mr-2 h-4 w-4" />
            {user ? "Back to Dashboard" : "Return to Home"}
          </Button>

          <Button
            variant="outline"
            onClick={() => navigate(user ? "/properties" : "/pricing")}
            className="w-full sm:w-auto"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {user ? "View My Properties" : "View Pricing & Plans"}
          </Button>
        </div>
      </div>
    </div>
  );
}
