export const PAID_PLANS = {
  starter: {
    id: "starter",
    name: "Solo",
    priceKes: 1500,
    properties: 2,
    units: 15,
    description: "For an independent landlord getting organized.",
  },
  plus: {
    id: "plus",
    name: "Growth",
    priceKes: 3000,
    properties: 10,
    units: 50,
    description: "For a growing portfolio across several properties.",
  },
  manager: {
    id: "manager",
    name: "Portfolio",
    priceKes: 4900,
    properties: 30,
    units: 100,
    description: "For landlords managing a larger portfolio.",
  },
} as const;

export type PaidPlanId = keyof typeof PAID_PLANS;

export const LEGACY_FREE_PLAN_LIMITS = {
  properties: null,
  units: 3,
} as const;

export function isPaidPlan(plan: string): plan is PaidPlanId {
  return Object.prototype.hasOwnProperty.call(PAID_PLANS, plan);
}

export function getPlanLimits(plan: string) {
  return plan === "free"
    ? LEGACY_FREE_PLAN_LIMITS
    : isPaidPlan(plan)
    ? PAID_PLANS[plan]
    : PAID_PLANS.starter;
}
