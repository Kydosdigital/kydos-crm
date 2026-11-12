// Ready-made automations. Each is created paused so nothing sends until you have read it and switched it on.
export type Preset = { key: string; name: string; blurb: string; trigger_type: string; trigger_value: string | null; steps: string };

export const PRESETS: Preset[] = [
  {
    key: "referral",
    name: "Referral request",
    blurb: "A week after a deal is won, ask the client who else they know who could use your help.",
    trigger_type: "deal_won",
    trigger_value: null,
    steps: `wait: 168
stop_if_replied
send_email: Quick favour, {{first_name}} | Hi {{first_name}},\\n\\nIt has been great working with you. If you know anyone who could use the same help, we would be grateful for an introduction. Just reply with their name and we will take it from there.\\n\\nThank you.
wait: 72
send_sms: Hi {{first_name}}, if you know anyone who could use our help, an introduction would mean a lot. Just reply here.
create_task: Check whether {{first_name}} sent a referral`,
  },
  {
    key: "reactivation",
    name: "Reactivation (cold leads)",
    blurb: "Winds up a lost deal with a polite check-in a month later, then a second nudge if there is no reply.",
    trigger_type: "deal_lost",
    trigger_value: null,
    steps: `wait: 720
stop_if_replied
send_email: Is this still on your radar? | Hi {{first_name}},\\n\\nIt has been a little while since we spoke. A lot can change in a month, so I wanted to check whether this is still something you want to look at. If timing was the issue, we are happy to pick it up again.\\n\\nJust reply and let me know.
wait: 120
stop_if_replied
send_sms: Hi {{first_name}}, just a quick follow-up. Is this still something you would like help with? Reply here any time.
create_task: Final call or close off {{first_name}}`,
  },
  {
    key: "text-to-pay",
    name: "Text-to-pay reminder",
    blurb: "After a proposal is accepted, nudges the client to pay and flags you if the payment has not arrived.",
    trigger_type: "proposal_accepted",
    trigger_value: null,
    steps: `send_sms: Hi {{first_name}}, thank you for accepting. Your payment link is in your email. Reply here if you have any trouble paying.
wait: 48
stop_if_replied
send_email: Payment reminder | Hi {{first_name}},\\n\\nA quick reminder that your payment is still outstanding. Your payment link is in our earlier email. If anything is unclear, just reply and we will sort it.
wait: 72
create_task: Chase payment from {{first_name}}`,
  },
];
