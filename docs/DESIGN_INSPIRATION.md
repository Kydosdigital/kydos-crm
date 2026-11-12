# Design inspiration (optional reference, not instructions)

Research notes gathered from 21st.dev (a community library of React and Tailwind components, installable with the shadcn CLI) and from looking at EspoCRM (an open source CRM) for feature and layout ideas. Use whatever helps, ignore the rest, and do your own research too. Nothing here fixes colours, fonts or brand.

Practical notes
- 21st.dev components are React + Tailwind and usually shadcn-style, so they fit this stack (Next 16, Tailwind 4). Check each component's licence on its page before copying (most say MIT, a few say "unknown"). Treat them as starting points to adapt, not to paste untouched.
- EspoCRM is AGPL-3.0. Use it for ideas about structure and features only. Do not copy its code or assets.
- Mobile is a later phase.

## 21st.dev: what exists, mapped to Kydos CRM areas

Category index: https://21st.dev/community/components (about 70 categories).

### App shell, navigation
- Dashboard with Collapsible Sidebar: https://21st.dev/@uniquesonu/components/dashboard-with-collapsible-sidebar
- Dashboard Shell: https://21st.dev/@isaiahbjork/components/app-dashboard-shell
- Sidebar with Search and Profile: https://21st.dev/@uiable/components/sidebar-5
- Rail Panel Sidebar: https://21st.dev/@dhxwhy/components/rail-panel-sidebar
- Nested Dashboard Menu: https://21st.dev/@ruixen.ui/components/nested-dashboard-menu
- Settings Sidebar Layout: https://21st.dev/@felipemenezes098/components/settings-2
- shadcn Sidebar: https://21st.dev/@shadcn/components/sidebar
- Page Header with Breadcrumbs: https://21st.dev/@olewandowski1/components/page-header-2
- Category pages: https://21st.dev/community/components/s/sidebar and /s/navigation-menu

### Command menu (quick search and actions)
- Command palette examples: https://21st.dev/@ibrandify/components/command-palette, https://21st.dev/@ddoemonn/components/command-palette, https://21st.dev/@moumensoliman/components/command-palette (with argument chips)

### Dashboards, stats, reports
- Stats cards with links (area chart, progress, trending variants): https://21st.dev/@ephraimduncan/components/stats-cards-with-links
- Stats Bento: https://21st.dev/@uilayout.contact/components/stats-bento
- Charts & KPI Cards: https://21st.dev/@uvain/components/revenue-charts-kpi
- Breakdown Stat Card, Delta Number Ticker: https://21st.dev/@dhxwhy/components/breakdown-stat-card, https://21st.dev/@dhxwhy/components/delta-number-ticker
- Number Ticker analytics cards: https://21st.dev/@danielpetho/components/basic-number-ticker/analytics-stats-cards
- Funnel charts (good for lead to won): https://21st.dev/@bklitai/components/funnel-chart , Conversion Funnel Area Chart: https://21st.dev/@ahmedmayara/components/conversion-funnel-area-chart
- Donut with centre total, area, bar, line chart families by Sean Hello (ReUI): https://21st.dev/@sean0205/components/c-chart-19
- Sparkline: https://21st.dev/@appica-dev/components/sparkline/colors
- Bento dashboards: https://21st.dev/@daiwiikharihar/components/bento-dashboard, Finance Bento https://21st.dev/@romanvasnev/components/finance-bento
- Draggable Grid Dashboard (rearrangeable widgets): https://21st.dev/@uilayout.contact/components/default-swapy
- Dashboard activities feed: https://21st.dev/@uniquesonu/components/dashboard-activities
- Dashboard category: https://21st.dev/community/components/s/dashboard

### Contacts, tables, lists
- Leads Data Table: https://21st.dev/@isaiahbjork/components/leads-data-table
- Data Grid Table family (striped, dense, sortable, row selection, expandable rows, movable columns): https://21st.dev/@sean0205/components/data-grid-table
- Resizable Table, Spark Table: https://21st.dev/@isaiahbjork/components/resizable-table, https://21st.dev/@isaiahbjork/components/spark-table
- User Table, Member List: https://21st.dev/@alain00/components/user-table, https://21st.dev/@ln-dev7/components/member-list
- Table category (313 items): https://21st.dev/community/components/s/table

### Pipeline (kanban)
- Kanban with WIP limits, priority bars, assignees: https://21st.dev/@namen/components/kanban-board
- Kanban with FLIP animation, keyboard moves, empty states: https://21st.dev/@victor-teles/components/kanban-board
- dnd-kit based boards: https://21st.dev/@diceui/components/kanban, https://21st.dev/@sean0205/components/kanban

### Inbox and conversations
- Animated AI Chat, v0 AI Chat, AI Input: https://21st.dev/@jatin-yadav05/components/animated-ai-chat, https://21st.dev/@kokonutd/components/v0-ai-chat, https://21st.dev/@aghasisahakyan1/components/ai-input
- WhatsApp-style chat layout: https://21st.dev/@rayimanoj8/components/chat-template/whatsapp-mock
- Message Dock: https://21st.dev/@isaiahbjork/components/message-dock

### Calendar, bookings
- Fullscreen Calendar: https://21st.dev/@ahmedmayara/components/fullscreen-calendar
- Floating Panel calendar: https://21st.dev/@anubra266/components/floating-panel/calendar-panel
- Visualize Booking: https://21st.dev/@ln-dev7/components/visualize-booking

### Finance (invoices, retainers, proposals)
- Invoice History Table: https://21st.dev/@ziegfiroyt/components/settings64
- Project Management Table: https://21st.dev/@shadcnspace/components/table-01
- Pricing sections (161) for proposal or plan layouts: https://21st.dev/community/components/s/pricing-section

### Integrations and system health
- Integrations Card Grid: https://21st.dev/@meschacirung/components/integrations-three
- System Status Block, Uptime Card, Log Viewer, API Key Manager, Rate Limit Meter: https://21st.dev/@preetsuthar17/components/system-status-block, https://21st.dev/@kokonutd/components/uptime-card, https://21st.dev/@mohammadshehadeh/components/log-viewer, https://21st.dev/@laziekiki/components/api-key-manager, https://21st.dev/@astralyxdev/components/rate-limit-meter

### Automations (builder feel)
- AI Agent Pipeline: https://21st.dev/@monolythdev/components/ai-agent-pipeline
- Radial Orbital Timeline: https://21st.dev/@jatin-yadav05/components/radial-orbital-timeline

### Auth and public client pages
- Sign in list (about 100): https://21st.dev/community/components/s/sign-in . Clean examples: Clean & Minimal https://21st.dev/@preetsuthar17/components/clean-minimal-sign-in , Split Sign In https://21st.dev/@diarmuradi/components/sign-in-3 , Auth Page https://21st.dev/@efferd/components/auth-page
- Forms category (1.7K): https://21st.dev/community/components/s/form
- Empty states: https://21st.dev/@uniquesonu/components/empty-state-beautiful-accessible-no-data-states , https://21st.dev/@olewandowski1/components/empty-states-1 , https://21st.dev/@cnippet-dev/components/cnippet-empty/products
- Skeleton loaders: https://21st.dev/@cnippet-dev/components/v-skeleton-8 , https://21st.dev/@cnippet-dev/components/v-skeleton-4
- Toasts, modals, tabs categories: https://21st.dev/community/components/s/toast , /s/modal , /s/tabs

### Marketing-style sections (for any public pages or onboarding)
- Features: https://21st.dev/community/components/s/features (Grid Feature Cards https://21st.dev/@efferd/components/grid-feature-cards , Bento https://21st.dev/@kinfe123/components/bento )
- Heroes, testimonials, FAQs, CTAs, footers are all categories on https://21st.dev/community/components

### Patterns worth noticing
Collapsible grouped sidebar with search and profile footer. Stat tiles with sparkline and delta. Bento layouts for dashboards. Dense, sortable tables with row selection and expandable rows. Kanban with WIP limits and keyboard support. Cmd+K command palette. Skeleton loading and designed empty states. Split-screen auth pages.

## EspoCRM: feature and layout ideas (not code)

Looked at the open source repo (modules and views). Things it does that are worth considering for Kydos CRM:
- **Stream**: a per-record and global activity feed (posts, status changes, who did what). Kydos has an activity log and timeline; a global stream view with filters could feel richer.
- **Dashlets**: user-configurable dashboard widgets (my tasks, pipeline by stage, leads by source, calendar). Suggests a customisable dashboard rather than fixed reports.
- **Activities panel** on every record: calls, meetings, tasks, emails together, with history.
- **Calendar** combining tasks, calls and meetings, with team and shared views.
- **Target lists and campaigns**: lists of leads or contacts, campaigns with tracked links, opt-out handling and a campaign log. Maps to Kydos smart lists and bulk campaigns.
- **Cases**, **Documents** with folders, and a **Knowledge Base** with categories and articles.
- **Reminders and notifications** (in-app bell with unread count).
- **Kanban view** on list pages, **mass update** and **export**, **duplicate detection**, **saved filters**, and **per-entity layouts** (which fields appear where).
- **Portal** for external users (clients seeing their own records), relevant to your client logins plan.
