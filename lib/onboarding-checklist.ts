/**
 * Stable titles let onboarding share the existing workspace-scoped tasks table
 * without introducing a migration or duplicating an entire task model.
 */
export const ONBOARDING_STEPS = [
  { key: "agreement", title: "Onboarding: Signed agreement", description: "Confirm the signed scope and commercial agreement are on file." },
  { key: "deposit", title: "Onboarding: Deposit confirmed", description: "Confirm the agreed initial payment or approved payment arrangement." },
  { key: "brief", title: "Onboarding: Client brief received", description: "Capture audience, objectives, brand voice, deliverables and key contacts." },
  { key: "access", title: "Onboarding: Access and assets received", description: "Collect approved account access, brand assets and relevant source links." },
  { key: "owner", title: "Onboarding: Account owner assigned", description: "Assign the person responsible for delivery and client communication." },
  { key: "delivery", title: "Onboarding: First deliverable agreed", description: "Confirm the first deliverable, agreed date and approval expectations." },
] as const;

export const onboardingTitles = new Set<string>(ONBOARDING_STEPS.map((step) => step.title));
