# KD-184: First-contact reporting definition

Status: proposed measurement contract for review. This document does not change message processing or production reporting.

## What the current report measures

At the time of this review, `app/(app)/reports/page.tsx` computes the "Median time to first message" from the earliest `messages.created_at` for each contact where `direction = 'out'` and `status != 'failed'`. It subtracts `contacts.created_at`, clamps negative durations to zero and displays the median for contacts created in the selected period that have a qualifying message. "Never contacted" counts contacts in the period without such a message. Queries are workspace-filtered, but the outgoing message query has a 40,000-row limit.

This is **first recorded non-failed outbound message**, not verified human first contact. An automated acknowledgement may qualify. A queued or accepted message may also qualify if its status is not `failed`. The code does not distinguish human and automation origin, nor prove delivery or reading. The report must not be described as a human response-time SLA until those distinctions are implemented and tested.

## Proposed event definitions

| Metric | Qualifying event | Exclusions |
| --- | --- | --- |
| First outbound attempt | Earliest outbound message creation, irrespective of later outcome | Inbound messages |
| First accepted outbound | Earliest outbound message with a confirmed provider acceptance event | Failed, draft, queued or unknown provider outcome |
| First human response | Earliest outbound communication explicitly attributed to a staff member, with an accepted provider outcome | Automated acknowledgements, workflow sends, failed or merely queued messages |
| Automated acknowledgement | First accepted outbound event explicitly attributed to an automation, form acknowledgement or workflow | Manual staff responses |
| No human response yet | Contact has no qualifying human response as of the report cutoff | An automated acknowledgement must not clear this state |

For the first-human-response SLA, the starting point is the contact's first qualifying inbound lead event, if reliably recorded. `contacts.created_at` is a fallback for imported or legacy contacts and must be labelled as such. Imported contacts must not silently be treated as newly received leads. All durations are calculated from UTC timestamps; London time is for grouping and display, not elapsed-time arithmetic.

A message's `direction` and `status` alone are insufficient to infer human origin or provider acceptance. Before implementation, inspect the actual database columns and sending paths and select a stable event/source discriminator. Do not infer origin from message body, template text or channel.

## Reporting behaviour and edge cases

1. Display separate human-response and acknowledgement metrics. Keep the existing metric labelled "First recorded outbound message" until migration to the new definition is complete.
2. Count each contact once per metric using the earliest qualifying event after the lead start. Preserve the underlying event ID and timestamps for audit and reconciliation.
3. Exclude messages before the lead start from the response-time sample, and surface clock/order anomalies rather than clamping them silently to zero.
4. If there is no qualifying event, retain the contact in the unanswered count. A failed send or automation-only response must not imply a human reply.
5. Show sample size and missing/unknown-origin counts. If queries fail or truncate, display "unavailable" or "incomplete", never a plausible zero.
6. Filter every underlying event by workspace and contact. Check date boundaries in Europe/London for reporting periods, without changing UTC duration calculations.
7. Define channel treatment explicitly: email, WhatsApp, SMS and manually logged phone calls are not interchangeable without a trustworthy accepted/sent event.
8. Avoid changing historical KPIs silently. Record the cutover date and explain the previous definition alongside new values.

## Acceptance tests required before the reporting implementation can be marked Done

- Human response following an automated acknowledgement: acknowledgement and human response timestamps remain separate.
- Automation-only, queued-only and failed-only contacts: each remains "no human response yet".
- Two staff messages: first eligible human response is counted once.
- Imported contact and message predating contact creation: neither produces a fabricated zero-minute response.
- Provider acceptance arrives late or fails: metrics use verified event state and reconcile correctly.
- Two workspaces with overlapping contact data: no cross-workspace events enter either report.
- London midnight and daylight-saving transitions: periods group correctly and durations remain accurate.
- More messages than the current 40,000-row cap, plus database errors: no silent partial KPI.
- Staging reconciliation against a small manually audited sample, with source event IDs and timestamps.

## Dependencies and ownership

The proposed metric requires confirmed message-origin and provider-outcome data. Any changes to `lib/messaging.ts`, `lib/automation.ts`, `app/api/**`, authentication, RLS or shared actions belong to Claude. Reporting UI changes should be reconciled with open KD-178 and KD-180 PRs before implementation. Only Claude applies live Supabase migrations.

This documentation completes the **definition and gap analysis** portion of KD-184. It does not claim the underlying event classification, corrected KPI, database checks or staging acceptance tests are complete.
