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

/** Additional repeatable checklists for each Kydos service. */
export const SERVICE_ONBOARDING_TEMPLATES = {
  social: {
    label: "Social media management",
    steps: [
      { key: "channels", title: "Onboarding (Social): Channels and access confirmed", description: "Confirm each approved social account, role and publishing connection." },
      { key: "pillars", title: "Onboarding (Social): Content pillars agreed", description: "Confirm audience, content themes, post frequency, voice and approval contact." },
      { key: "calendar", title: "Onboarding (Social): First calendar approved", description: "Agree the first posting calendar, creative assets and the approval deadline." },
    ],
  },
  ppc: {
    label: "Paid advertising",
    steps: [
      { key: "accounts", title: "Onboarding (PPC): Ad account access confirmed", description: "Confirm authorised ad account, conversion tracking and business permissions." },
      { key: "budget", title: "Onboarding (PPC): Budget and objectives approved", description: "Record spend approval, location targeting, KPIs and campaign objectives." },
      { key: "launch", title: "Onboarding (PPC): Launch checklist reviewed", description: "Review ads, landing page, tracking and campaign approval before publishing." },
    ],
  },
  seo: {
    label: "Search engine optimisation",
    steps: [
      { key: "property", title: "Onboarding (SEO): Analytics properties connected", description: "Verify Search Console, Analytics and site access." },
      { key: "baseline", title: "Onboarding (SEO): Search baseline recorded", description: "Record organic traffic, rankings, key pages and technical health." },
      { key: "priorities", title: "Onboarding (SEO): First priorities agreed", description: "Agree target keywords, content opportunities and technical work." },
    ],
  },
  web: {
    label: "Website design and development",
    steps: [
      { key: "access", title: "Onboarding (Web): Hosting and site access checked", description: "Confirm domain, hosting, CMS, backup and authorised account access." },
      { key: "requirements", title: "Onboarding (Web): Scope and pages signed off", description: "Agree site objectives, user journeys, required pages and acceptance criteria." },
      { key: "launch", title: "Onboarding (Web): Launch and handover plan agreed", description: "Confirm milestones, UAT owners, deployment checks and handover expectations." },
    ],
  },
} as const;

export const allOnboardingTitles = [
  ...ONBOARDING_STEPS.map((step) => step.title),
  ...Object.values(SERVICE_ONBOARDING_TEMPLATES).flatMap((service) => service.steps.map((step) => step.title)),
];
export const onboardingTitles = new Set<string>(allOnboardingTitles);

