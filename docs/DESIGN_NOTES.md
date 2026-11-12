# Kydos CRM: design notes

How the interface is put together, so new pages stay consistent. This was a presentation-only pass: no server actions, queries, routes or input names changed.

## Identity

- **Feel:** calm, warm and precise. A paper-coloured ground, green-tinted ink, one deep pine brand colour and a small lime "spark" used sparingly (logo, active navigation, selection).
- **Type:** Geist for the interface, Geist Mono for code and step syntax, Instrument Serif (`font-display`) for headings on client-facing pages only (sign in, proposals, forms, approvals, payment results). App page titles stay in Geist so working screens feel quick and dense.
- **Icons:** `lucide-react`, 16px in controls and navigation, always `aria-hidden` next to a text label.
- **Tone of voice:** plain UK English, short sentences, no em dashes. Buttons say what they do ("Add contact", "Approve and send").
- **Density:** 14px base, 13px in tables and controls, 36px controls (30px for `-sm`), 12px card radius, 8px control radius.

## Tokens (`app/globals.css`)

Every colour is a CSS variable, exposed to Tailwind through `@theme inline`. Use the utilities, never hex values in pages.

| Purpose | Utilities |
| --- | --- |
| Page ground, cards, wells | `bg-canvas`, `bg-surface`, `bg-sunken`, `bg-subtle` |
| Borders | `border-line`, `border-line-strong` |
| Text | `text-ink` (headings, values), `text-ink-2` (body), `text-muted` (secondary), `text-faint` (icons, placeholders only) |
| Brand | `bg-brand` + `text-on-brand` (primary buttons), `text-brand-text` (links, active), `bg-brand-soft` + `text-brand-soft-ink` (tints) |
| Status | `success`, `warning`, `danger`, `info`, `neutral`, `violet`, each with `-bg` and `-ink` |
| Sidebar | `side-*` (dark in both themes) |
| Elevation | `shadow-xs`, `shadow-sm`, `shadow-md`, `shadow-lg` |

Themes: light is the default. `data-theme="dark"` on `<html>` switches every token; the toggle in the sidebar stores the choice in `localStorage` (`kydos-theme`) and a small inline script in `app/layout.tsx` applies it before first paint. Client-facing pages set `data-theme="light"` on their wrapper so clients always get the light, print-like look. In dark mode the primary button becomes lime with dark text, which keeps AA contrast.

Contrast: body, muted and status text pairs are chosen to meet WCAG AA on their backgrounds. `text-faint` is for decoration and placeholders only.

## Component classes (CSS, in `globals.css`)

Plain classes, so they work on native elements and keep forms simple.

- **Buttons:** `btn` plus `btn-primary` (one per view), `btn-secondary`, `btn-ghost`, `btn-danger` (destructive, quiet until hover). Sizes `btn-sm`, `btn-lg`; `btn-icon` for square icon buttons. Links styled as buttons use the same classes.
- **Inputs:** `input`, `select`, `textarea`, with `input-sm` for dense rails. `checkbox` and `check-row` for a checkbox with its label. `label` and `hint` for text around a control.
- **Surfaces:** `card` (white, bordered, soft shadow), `well` (sunken inset), `codeblock`.
- **Tables:** `table` inside a `TableCard`; `table-compact` for logs; `num` on right-aligned numeric cells; `tabular` for tabular figures anywhere.
- **Badges:** `badge` plus `badge-success|warning|danger|info|brand|violet|outline`, and `badge-dot` for a status dot.
- **Alerts:** `alert` plus `alert-success|warning|danger|info`.
- **Segmented control:** `segmented` wrapping links, the current one marked with `aria-current="page"`.
- **Disclosure:** `disclosure` on a `<details>` gives the chevron and spacing.
- **Modal:** `modal` (and `modal-wide`) on a native `<dialog>`.
- **Other:** `link`, `link-quiet`, `eyebrow`, `kbd`, `meter`, `skeleton`, `rich` (for HTML from `bodyToHtml`), `animate-rise`.

## React components

`components/ui/index.tsx` (server-safe):

- `Page` (standard container; `width="narrow"` limits line length, `width="full"` for boards), `PageHeader` (title, description, `meta` badges, `actions`, optional `back` link), `Section`, `Card`, `CardTitle`, `TableCard`.
- `Alert`, `Badge`, `StatusBadge` (maps a database status to a consistent tone via `statusTone`), `EmptyState`, `Stat`, `Avatar`, `Meter`, `ChannelIcon`, `Field`, `Segmented`.
- Helpers in `format.ts`: `personName`, `dateTime`, `dateOnly`, `humanise`, `statusTone`.

Client components, visual behaviour only:

- `components/ui/modal.tsx` `Modal`: trigger button plus `<dialog>`. Server-rendered forms are passed as children and keep their server action; the dialog closes when a form inside it submits.
- `components/ui/copy-button.tsx` `CopyButton`, `CodeBlock`.
- `components/ui/scroll-end.tsx` `ScrollEnd`: conversation box that opens scrolled to the latest message.
- `components/shell/*`: `SidebarNav` (active state from the pathname), `WorkspaceSelect` (submits the existing switch form on change), `CommandMenu` (Ctrl or Cmd + K, links to existing routes and to `/contacts?q=`), `ThemeToggle`. Navigation structure lives in `components/shell/nav.ts`.
- `components/shell/public-shell.tsx`: `AuthShell`, `ClientShell`, `PublicHeading`, `ResultCard` for pages seen without a login.

## Page patterns

1. Start with `<Page>` and a `<PageHeader>`. Feedback from `searchParams` (`error`, `done`, and so on) goes straight under the header as an `<Alert>`.
2. **List pages** (Contacts, Invoices, Retainers, Proposals): stats row if there are totals, then one `TableCard`. The create form lives in a `Modal` opened from the header's primary button. Row actions are `btn-ghost btn-sm`, destructive ones `btn-danger btn-sm`.
3. **List plus composer** (Templates, Snippets, Knowledge base, Team, Content calendar, Campaigns): items on the left, a sticky card with the create form on the right.
4. **Boards** (Pipeline, Tasks): `width="full"`, columns are tinted wells holding `card`s.
5. **Record page** (Contact): header card, main column for the conversation and timeline, a 340px rail of small cards.
6. **Empty states:** always an `EmptyState` with an icon, one line saying what belongs here and how to add it.
7. **Forms:** every control has a visible label (`Field`) or an `aria-label`. Placeholders are examples, not labels.
8. One primary button per view. Keep the default submit button first in the DOM when a form has several submit buttons, then reorder visually with `order-*` if needed, so pressing Enter still does what it did before.

## Navigation

The flat list of 23 links is grouped: Inbox and Tasks on top, then Customers, Engage, Automate, Money, Insights and Workspace. Routes are unchanged. "Bulk email" is labelled "Campaigns" in the sidebar because the page covers email, SMS and WhatsApp.

## Accessibility

Visible focus ring on everything (`:focus-visible`), a skip link in the app shell, labelled form controls, `aria-current` on active navigation and tabs, status never shown by colour alone (badges carry text), and `prefers-reduced-motion` switches animation off.

## Requests for the engineer

Things that would make screens better but need functional changes, so they were not done:

1. **Inbox as a two-pane view.** Thread list on the left, the conversation and reply box on the right, with real unread state. Needs a selected-thread route or param, and a read marker on messages. Today "awaiting reply" is inferred from the latest message being inbound.
2. **Sidebar counts.** Unread conversations, tasks due today and drafts awaiting approval as small badges in the navigation. Needs counts fetched in the app layout.
3. **Signed-in user in the shell.** Name, email and role in the sidebar footer, and hiding admin-only items (Team, Settings) from members. Needs the user and role passed to the layout.
4. **Pipeline drag and drop**, plus an "Add opportunity" button on each column. Needs a client call to `moveOpportunity`. The stage menu and Move button remain for now.
5. **Contacts table:** sortable columns, pagination beyond the first 200, row selection with bulk tag, enrol and delete, and saved filters. The tag chips already link to `/contacts?tag=`.
6. **Confirmation before destructive actions** (delete contact, delete automation, cancel retainer, revoke link, delete proposal). They currently run on one click. A confirm dialog is easy visually but changes submit behaviour, so it is left to you.
7. **Toasts after actions.** Many actions redirect without a message (add tag, save note, move stage). A `?saved=` style flag, or `useActionState`, would allow a consistent success toast.
8. **Automation builder.** A visual step editor (add, reorder, configure) writing the same step text. The list view already draws steps as a flow; editing is still the text area with a reference panel.
9. **Form builder.** Field rows with type pickers instead of the `key | label | type | required` text area, with a live preview.
10. **Default brand colour.** `lib/emailBrand.ts`, the proposal page fallback and the Settings default still use the old navy `#1f3a5f`. Suggest the new pine `#0e5a48` so emails and proposals match the product when a business has not set its own colour. The email layout itself lives in `lib/` and was not restyled.
11. **Branded hosted forms and client pages.** The proposal page uses the workspace brand colour and logo; the hosted form, content calendar and feedback pages do not load them. Passing `brand_color` and `logo_url` to those pages would let every client page carry the client-facing brand.
12. **Content calendar:** a month grid view and image previews for `media_url`; on the client page, show the image inline rather than as a link.
13. **Reports and Analytics:** period-over-period deltas on the stat tiles and a simple trend line need previous-period queries.
14. **Dates in the timeline** on the contact page are built as text in the page query section; structured entries (type, channel, status) would allow icons and filters per entry type.
15. **Integrations:** a "Re-run checks" button and per-integration setup links, instead of reloading the page.
16. **Favicon and metadata.** `app/favicon.ico` is still the default. The new mark is in `components/shell/logo.tsx` and can be exported as an icon. Public pages could also set their own page titles (for example the proposal title).
17. **Mobile.** Left for the later phase as agreed: the sidebar needs a drawer and the two-column pages need to stack.
