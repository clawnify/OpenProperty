/** Toast/banner copy for Rent → Generate charges (WS-N soft-fail leftover). */

export type GenerateChargesFeedback =
  | { kind: "notice"; message: string }
  | { kind: "error"; message: string };

export type GenerateChargesResultInput = {
  created: number;
  periodLabel: string;
  /** Active leases considered by generateCharges (0 ⇒ empty portfolio). */
  activeLeases: number;
};

/**
 * Map generateCharges success / soft outcomes / thrown failures to the
 * portal’s NoticeBanner (green) or ErrorBanner (red) toast slots.
 */
export function feedbackForGenerateCharges(
  result: GenerateChargesResultInput | null,
  error: unknown,
): GenerateChargesFeedback {
  if (error != null) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Could not generate charges.";
    return { kind: "error", message };
  }
  if (!result) {
    return { kind: "error", message: "Could not generate charges." };
  }
  if (result.created > 0) {
    const noun = result.created === 1 ? "charge" : "charges";
    return {
      kind: "notice",
      message: `Created ${result.created} ${noun} for ${result.periodLabel}.`,
    };
  }
  if (result.activeLeases === 0) {
    return {
      kind: "notice",
      message: "No active leases to charge for this period.",
    };
  }
  return {
    kind: "notice",
    message: "All active leases already have a charge for this period.",
  };
}
