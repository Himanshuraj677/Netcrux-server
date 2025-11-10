export const PLAN_LIMITS = {
  FREE: {
    maxActiveTunnels: 5,
    allowCustomSubdomain: false,
  },
  BASIC: {
    maxActiveTunnels: 10,
    allowCustomSubdomain: true,
  },
  PRO: {
    maxActiveTunnels: 50,
    allowCustomSubdomain: true,
  },
  ENTERPRISE: {
    maxActiveTunnels: 1000,
    allowCustomSubdomain: true,
  },
} as const;
