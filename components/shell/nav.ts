import {
  Activity, Clock3, BarChart3, BookOpen, Bot, CalendarDays, CheckSquare, FileSignature, FileText, FormInput, Gauge, Inbox, KanbanSquare,
  LineChart, ListFilter, Megaphone, Plug, Receipt, Repeat, Settings, TextQuote, Users, UsersRound, Workflow, LayoutTemplate, MessageCircle, PhoneCall,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; keywords?: string };
export type NavGroup = { label: string | null; items: NavItem[] };

/** Sidebar structure. Routes are unchanged from the original flat list; only the grouping and labels are new. */
export const NAV: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/inbox", label: "Inbox", icon: Inbox, keywords: "messages conversations replies" },
      { href: "/tasks", label: "Tasks", icon: CheckSquare, keywords: "to do follow up" },
      { href: "/morning", label: "Morning actions", icon: Clock3, keywords: "daily dashboard urgent leads tasks missed calls approvals invoices" },
    ],
  },
  {
    label: "Customers",
    items: [
      { href: "/contacts", label: "Contacts", icon: Users, keywords: "leads people clients" },
      { href: "/pipeline", label: "Pipeline", icon: KanbanSquare, keywords: "deals opportunities stages kanban" },
      { href: "/lists", label: "Lists and fields", icon: ListFilter, keywords: "smart lists custom fields segments" },
    ],
  },
  {
    label: "Engage",
    items: [
      { href: "/broadcast", label: "Campaigns", icon: Megaphone, keywords: "bulk email sms whatsapp broadcast" },
      { href: "/templates", label: "Templates", icon: LayoutTemplate, keywords: "email templates" },
      { href: "/call-tracking", label: "Call tracking", icon: PhoneCall, keywords: "phone numbers campaign source calls" },
      { href: "/whatsapp", label: "WhatsApp templates", icon: MessageCircle, keywords: "whatsapp meta approved template" },
      { href: "/snippets", label: "Snippets", icon: TextQuote, keywords: "canned replies" },
      { href: "/calendar", label: "Content calendar", icon: CalendarDays, keywords: "social posts approval" },
    ],
  },
  {
    label: "Automate",
    items: [
      { href: "/automations", label: "Automations", icon: Workflow, keywords: "workflows sequences triggers" },
      { href: "/forms", label: "Forms", icon: FormInput, keywords: "hosted forms popup embed" },
      { href: "/agent", label: "Comms agent", icon: Bot, keywords: "ai drafts approval" },
      { href: "/knowledge", label: "Knowledge base", icon: BookOpen, keywords: "agent knowledge faq" },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/invoices", label: "Invoices", icon: Receipt, keywords: "estimates payments stripe" },
      { href: "/retainers", label: "Retainers", icon: Repeat, keywords: "subscriptions mrr recurring" },
      { href: "/proposals", label: "Proposals", icon: FileSignature, keywords: "quotes accept" },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/reports", label: "Reports", icon: BarChart3, keywords: "leads sources win rate" },
      { href: "/reports/weekly", label: "Weekly summary", icon: FileText, keywords: "client reporting leads bookings content" },
      { href: "/analytics", label: "Analytics", icon: LineChart, keywords: "engagement opens clicks" },
      { href: "/activity", label: "Activity and calls", icon: Activity, keywords: "audit log backup" },
      { href: "/usage", label: "Usage", icon: Gauge, keywords: "costs billing" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/integrations", label: "Integrations", icon: Plug, keywords: "health checks channels" },
      { href: "/team", label: "Team", icon: UsersRound, keywords: "members invite" },
      { href: "/settings", label: "Settings", icon: Settings, keywords: "business branding webhooks" },
    ],
  },
];

export const EXTRA_COMMANDS: NavItem[] = [
  { href: "/contacts/import", label: "Import contacts from CSV", icon: FileText, keywords: "upload gohighlevel" },
];
