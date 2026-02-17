import { useCorral } from "../context/CorralProvider";

export interface FeatureGateResult {
  /** Feature is locked for the current user */
  isLocked: boolean;
  /** Why it's locked — determines which prompt to show */
  lockReason: "none" | "auth" | "plan";
  /** User is admin (bypasses all gating) */
  isAdmin: boolean;
  /** User is authenticated (but may not have required plan) */
  isAuthenticated: boolean;
  /** Lowest plan that includes this feature */
  requiredPlan: string | null;
  /** Human-readable name of required plan */
  planName: string | null;
  /** User's current plan (null if anonymous or no subscription) */
  currentPlan: string | null;
  /** Whether the feature requires auth only (included in free/all plans) */
  requiresAuthOnly: boolean;
}

/**
 * useFeatureGate — Checks feature access across the full gating hierarchy:
 *
 *   Anonymous → Free (logged in) → Pro (paid) → Admin (bypass all)
 *
 * Features in corral.yaml can be gated at any level:
 *   - Listed plans include a free plan → requires auth only
 *   - Listed plans are all paid → requires subscription
 *   - No config → unlocked for everyone (including anonymous)
 *
 * Config example:
 *   features:
 *     browse-catalog: ["*"]              # anyone, even anonymous
 *     save-favorites: ["free", "pro"]    # requires login (free works)
 *     voice-intel: ["pro", "enterprise"] # requires paid plan
 */
export function useFeatureGate(featureId: string): FeatureGateResult {
  const { user, subscription, config, plans } = useCorral();

  const currentPlan = subscription?.planId ?? null;
  const isAdmin = (user as any)?.role === "admin";
  const isAuthenticated = !!user;
  const features = config?.features;

  const base = { isAdmin, isAuthenticated, currentPlan };

  // No features config = everything unlocked (including anonymous)
  if (!features || !features[featureId]) {
    return { ...base, isLocked: false, lockReason: "none", requiredPlan: null, planName: null, requiresAuthOnly: false };
  }

  const allowedPlans = features[featureId];

  // Wildcard "*" means open to everyone including anonymous
  if (allowedPlans.includes("*")) {
    return { ...base, isLocked: false, lockReason: "none", requiredPlan: null, planName: null, requiresAuthOnly: false };
  }

  // Admin bypass
  if (isAdmin) {
    const first = allowedPlans[0] ?? null;
    const plan = plans?.find((p: any) => p.id === first);
    return { ...base, isLocked: false, lockReason: "none", requiredPlan: first, planName: plan?.name ?? first, requiresAuthOnly: false };
  }

  // Check if any allowed plan is "free" / "observer" / the free tier
  // Convention: plan named "free", or first plan in config with no priceId, or marked freeTier
  const freePlans = plans?.filter((p: any) => !p.priceId || p.freeTier || p.id === "free" || p.price === 0) ?? [];
  const freePlanIds = new Set(freePlans.map((p: any) => p.id));
  const requiresAuthOnly = allowedPlans.some((id: string) => id === "free" || id === "authenticated" || freePlanIds.has(id));

  // Not authenticated — check if feature even requires auth
  if (!isAuthenticated) {
    // If the feature allows free/authenticated plans, it needs login
    // If it only allows paid plans, it still needs login first
    const first = allowedPlans[0] ?? null;
    const plan = plans?.find((p: any) => p.id === first);
    return {
      ...base,
      isLocked: true,
      lockReason: "auth",
      requiredPlan: first,
      planName: plan?.name ?? first,
      requiresAuthOnly,
    };
  }

  // Authenticated — check plan access
  // "authenticated" is a magic plan meaning "any logged-in user"
  if (allowedPlans.includes("authenticated")) {
    return { ...base, isLocked: false, lockReason: "none", requiredPlan: null, planName: null, requiresAuthOnly: true };
  }

  // If feature allows free plans and user is on free tier (no subscription), allow
  if (requiresAuthOnly && !currentPlan) {
    return { ...base, isLocked: false, lockReason: "none", requiredPlan: null, planName: null, requiresAuthOnly: true };
  }

  const isLocked = !currentPlan || !allowedPlans.includes(currentPlan);
  const requiredPlan = allowedPlans.find((id: string) => !freePlanIds.has(id) && id !== "authenticated") ?? allowedPlans[0] ?? null;
  const plan = plans?.find((p: any) => p.id === requiredPlan);

  return {
    ...base,
    isLocked,
    lockReason: isLocked ? "plan" : "none",
    requiredPlan,
    planName: plan?.name ?? requiredPlan,
    requiresAuthOnly,
  };
}
