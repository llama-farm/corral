// Context
export { CorralProvider, useCorral } from "./context/CorralProvider";
export type {
  CorralProviderProps,
  CorralContextValue,
  CorralUser,
  CorralSubscription,
  CorralMeterUsage,
  CorralPlan,
  CorralNudge,
  CorralConfig,
  CorralSession,
} from "./context/CorralProvider";

// Components
export { SignIn } from "./components/SignIn";
export type { SignInProps } from "./components/SignIn";

export { SignUp } from "./components/SignUp";
export type { SignUpProps } from "./components/SignUp";

export { UserButton } from "./components/UserButton";
export type { UserButtonProps } from "./components/UserButton";

export { PlanPicker } from "./components/PlanPicker";
export type { PlanPickerProps } from "./components/PlanPicker";

export { UsageMeters } from "./components/UsageMeters";
export type { UsageMetersProps } from "./components/UsageMeters";

export { UsageBadge } from "./components/UsageBadge";
export type { UsageBadgeProps } from "./components/UsageBadge";

export { ProfilePage } from "./components/ProfilePage";
export type { ProfilePageProps } from "./components/ProfilePage";

export { PaywallModal } from "./components/PaywallModal";
export type { PaywallModalProps } from "./components/PaywallModal";

export { NudgeBanner } from "./components/NudgeBanner";
export type { NudgeBannerProps } from "./components/NudgeBanner";

export { CancelFlow } from "./components/CancelFlow";
export type { CancelFlowProps } from "./components/CancelFlow";

// Gating Components
export { FeatureGate } from "./gating/FeatureGate";
export type { FeatureGateProps } from "./gating/FeatureGate";

export { useFeatureGate } from "./gating/useFeatureGate";

export { UpgradePrompt } from "./gating/UpgradePrompt";
export type { UpgradePromptProps } from "./gating/UpgradePrompt";

export { ProBadge } from "./gating/ProBadge";
export type { ProBadgeProps } from "./gating/ProBadge";

export { UpgradeCTA } from "./gating/UpgradeCTA";
export type { UpgradeCTAProps } from "./gating/UpgradeCTA";

export { useUsageGate } from "./gating/useUsageGate";

export { UsageLimitBanner } from "./gating/UsageLimitBanner";
export type { UsageLimitBannerProps } from "./gating/UsageLimitBanner";

export { useAuthGate } from "./gating/useAuthGate";
export type { AuthGateResult, UseAuthGateOptions } from "./gating/useAuthGate";

export { AuthGate } from "./gating/AuthGate";
export type { AuthGateProps } from "./gating/AuthGate";

export { LoginPrompt } from "./gating/LoginPrompt";
export type { LoginPromptProps } from "./gating/LoginPrompt";

export { PageGate } from "./gating/PageGate";
export type { PageGateProps } from "./gating/PageGate";

export { SkeletonPage } from "./gating/SkeletonPage";
export type { SkeletonPageProps } from "./gating/SkeletonPage";

export { BlurOverlay } from "./gating/BlurOverlay";
export type { BlurOverlayProps } from "./gating/BlurOverlay";

export { CheckoutModal, useCheckout } from "./components/CheckoutModal";
export type { CheckoutModalProps } from "./components/CheckoutModal";

export { PasswordReset } from "./components/PasswordReset";
export type { PasswordResetProps } from "./components/PasswordReset";

export { BillingPortal } from "./components/BillingPortal";
export type { BillingPortalProps } from "./components/BillingPortal";
