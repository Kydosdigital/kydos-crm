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

You decide. Use your own design skills and your own research of current best-in-class CRM and SaaS products to choose the visual identity: colour palette, typography, iconography, density, layout patterns, motion and tone. Nothing here is prescribed. The only fixed point is the outcome: it must look and feel genuinely premium and modern, and be a pleasure to use all day.

Context you may find useful, not constraints:
- Product: Kydos CRM, used by a small UK digital marketing agency (Kydos Digital) to manage leads, pipeline, conversations across email, SMS, WhatsApp, Messenger and Instagram, automations, invoices, retainers and proposals. Some pages are seen by clients (proposals, content calendar approvals, payment pages, forms, login), so those need to reflect well on the agency.
- The current look is a basic placeholder (plain Tailwind, navy `#1f3a5f` accent). Change it freely, including the colour. There is no existing brand guideline to follow.
- Ideas to cover: navigation structure and grouping, page headers, a consistent component set (buttons, inputs, cards, tables, badges, tabs, modals or drawers, empty states, alerts), light and optionally dark themes, accessibility (AA contrast, focus states, keyboard use), UK English microcopy with no em dashes.
- Mobile layout is a later phase; do not prioritise it yet.

## Deliverables

1. Design tokens and base styles in `app/globals.css`.
2. A small shared component set (suggest `components/ui/`).
3. The restyled shell (`app/(app)/layout.tsx`) and each page above.
4. A short `docs/DESIGN_NOTES.md` describing the system so future pages stay consistent.

Anything that would need a functional change to look right: do not do it. Write it in `docs/DESIGN_NOTES.md` under "Requests for the engineer" instead.
