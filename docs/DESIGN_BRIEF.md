# Kydos CRM: design brief (UI and UX only)

Goal: make Kydos CRM look and feel like a premium, modern product, on a par with the best current CRMs and SaaS dashboards. This is a presentation-only job. **No functionality may change.**

## Hard rules (do not break these)

1. **Do not edit** anything in `lib/`, `app/api/`, `supabase/`, `proxy.ts`, `app/actions.ts`, or any `route.ts`. Server logic, data fetching in pages, and the database are out of scope.
2. In page files (`app/**/page.tsx`, `layout.tsx`) you may change JSX structure, class names, and extract presentational components. You must keep:
   - every `<form action={...}>` wired to the same server action, with the **same input `name` attributes**, hidden inputs and button `name`/`value` pairs (the actions read them by name);
   - every data query, `searchParams` handling, and redirect exactly as is;
   - links and routes (`href`s) unchanged. New pages are not needed.
3. Server components stay server components. Only add `"use client"` for purely visual behaviour (menus, toggles, tabs), and never move data fetching or actions into client code.
4. Read `AGENTS.md` first: this is a newer Next.js (16) with Tailwind 4. Check `node_modules/next/dist/docs/` before using any Next API you are unsure about.
5. Public pages must keep working with no login and keep their form posts: `app/login`, `app/signup`, `app/set-password`, `app/f/**` (hosted forms, proposals, content calendar share, payment result), `app/u/**` (unsubscribe). These are what clients and customers see, so they matter most for brand.
6. Run `npx tsc --noEmit`, `npx eslint .` and `npm run build` before finishing. All must pass with no new errors.
7. Work in small commits on a branch, not on `main`.

## Design direction

- Premium, calm, confident. Think Attio, Linear, Stripe Dashboard, Folk, Close, HubSpot's newer UI, Pipedrive. Study their public marketing sites and screenshots for patterns (do not copy assets).
- Light theme first, with a refined dark option if it is cheap to add via CSS variables.
- Brand: Kydos Digital. Current brand navy `#1f3a5f`. Propose a full palette from it (neutrals, accent, success, warning, danger) as CSS variables in `app/globals.css`, plus a type scale (a modern sans such as Inter or Geist via `next/font`), spacing, radius and shadow tokens.
- Layout: a slim, grouped sidebar (Sales, Marketing, Communication, Finance, Admin) with icons and an active state, a top bar with workspace switcher and user menu, a consistent page header (title, description, primary action), generous whitespace.
- Components to design once and reuse: buttons (primary, secondary, ghost, danger), inputs/selects/textareas with labels and focus rings, cards, tables with sticky headers and row hover, badges/status pills, tabs, empty states, alerts/toasts, modals or drawers for create/edit forms, avatar/initials, stat tiles.
- Key screens to get right first: Contacts list and contact detail (timeline, notes, messages, tasks), Pipeline (kanban with drag-feel cards), Inbox, Dashboard-style Reports/Analytics, Integrations, Invoices/Retainers/Proposals, Automations (edit page should feel like a builder), Forms, Settings, and the public client pages.
- Empty, loading and error states for every list. Friendly microcopy in UK English, no em dashes.
- Accessibility: AA contrast, visible focus, keyboard navigation, semantic HTML.
- Mobile layout is a **later phase**; keep things responsive-friendly but do not prioritise it yet.

## Deliverables

1. Design tokens and base styles in `app/globals.css`.
2. A small shared component set (suggest `components/ui/`).
3. The restyled shell (`app/(app)/layout.tsx`) and each page above.
4. A short `docs/DESIGN_NOTES.md` describing the system so future pages stay consistent.

Anything that would need a functional change to look right: do not do it. Write it in `docs/DESIGN_NOTES.md` under "Requests for the engineer" instead.
