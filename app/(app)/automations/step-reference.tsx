import { BookText } from "lucide-react";

// Presentational reference for the automation step language. The wording mirrors the parser in lib/automationSteps.
const GROUPS: [string, [string, string][]][] = [
  ["Messages", [
    ["send_email: Subject | Body", "Branded email"],
    ["send_sms: Body", "Text message"],
    ["send_whatsapp: template_name | first_name tag | other variables", "Approved Meta template"],
    ["notify: Subject | Body", "Emails you"],
    ["webhook: https://url", "Signed POST"],
  ]],
  ["Timing", [
    ["wait: hours", "Pause the run"],
    ["wait_weekday: 9", "Next weekday at 9am"],
    ["wait_until: cond | hours", "Waits for a goal, or times out"],
    ["wait_before: hours | skip_n", "Before a booking; skips n steps if already too late"],
    ["wait_after: hours", "After a booking"],
  ]],
  ["Branching", [
    ["skip_if: cond | n", "Skip the next n steps if true"],
    ["skip_unless: cond | n", "Skip the next n steps if false"],
    ["split: 50 | n", "50% of contacts skip the next n steps, for split tests"],
    ["stop_if_replied", "Stop when the contact has replied"],
    ["end", "Stops the run"],
  ]],
  ["CRM actions", [
    ["add_tag: x", "Add a tag"],
    ["remove_tag: x", "Remove a tag"],
    ["create_task: title", "Add a task"],
    ["move_stage: Stage name", "Move the opportunity"],
    ["create_opportunity: Title | value | Stage", "New pipeline card"],
    ["assign_owner: teammate@email.com", "Or round_robin"],
    ["set_field: key = value", "Set a custom field"],
    ["enrol: Other automation name", "Start another automation"],
  ]],
];

export function StepReference({ open }: { open?: boolean }) {
  return (
    <details className="disclosure well px-4 py-3" open={open}>
      <summary className="text-[13px]"><BookText className="h-4 w-4 text-muted" aria-hidden />Step reference</summary>
      <p className="hint mt-3">One step per line. Write line breaks inside a message as <code>\n</code>.</p>
      <div className="mt-3 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {GROUPS.map(([title, rows]) => (
          <div key={title}>
            <p className="eyebrow mb-1.5">{title}</p>
            <dl className="flex flex-col gap-1.5">
              {rows.map(([code, what]) => (
                <div key={code}><dt className="font-mono text-[11.5px] leading-snug text-ink">{code}</dt><dd className="text-xs text-muted">{what}</dd></div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-2 border-t border-line pt-3 text-xs leading-relaxed text-muted">
        <p><b className="font-semibold text-ink-2">Conditions:</b> replied, opened, clicked, failed, tag:x, stage:Name, field:key=value, booked, booking_active, no_show, attended (prefix ! to negate).</p>
        <p><b className="font-semibold text-ink-2">Merge tags</b> (double curly braces around the name): first_name, review_link, booking_link, booking_date, booking_time, feedback_link, business and any custom field key. Use <code>{"{{first_name}}"}</code>.</p>
      </div>
    </details>
  );
}
