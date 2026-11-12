"use client";

import { useActionState, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { confirmMfa, enrolMfa, type EnrolState } from "@/app/mfa-actions";
import { Alert } from "@/components/ui";

/** Two-step setup: show a QR code, then confirm with the first code from the authenticator app. */
export function MfaSetup() {
  const [start, setStart] = useState<EnrolState>(null);
  const [busy, setBusy] = useState(false);
  const [state, confirm, pending] = useActionState(confirmMfa, null as EnrolState);

  if (state?.done) return <Alert tone="success">Two-factor sign-in is on. You will be asked for a code each time you sign in.</Alert>;

  if (!start?.factorId) {
    return (
      <div className="flex flex-col gap-3">
        {start?.error && <Alert tone="danger">{start.error}</Alert>}
        <button type="button" disabled={busy} className="btn btn-primary self-start" onClick={async () => { setBusy(true); setStart(await enrolMfa()); setBusy(false); }}>
          <ShieldCheck aria-hidden />Set up two-factor sign-in
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-ink-2">1. Scan this code with an authenticator app such as Google Authenticator, 1Password or Authy.</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={start.qr} alt="QR code for your authenticator app" className="h-44 w-44 rounded-lg border border-line bg-white p-2" />
      <p className="text-xs text-muted">Cannot scan? Enter this key instead: <code className="select-all break-all">{start.secret}</code></p>
      <form action={confirm} className="flex flex-col gap-2">
        <input type="hidden" name="factor_id" value={start.factorId} />
        <label className="label" htmlFor="mfa-code">2. Enter the 6-digit code it shows</label>
        <div className="flex gap-2">
          <input id="mfa-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" required className="input w-40 tabular" />
          <button className="btn btn-primary" disabled={pending}>Turn on</button>
        </div>
        {state?.error && <p className="text-[13px] text-danger-ink">{state.error}</p>}
      </form>
    </div>
  );
}
