import { supabaseAdmin } from "./supabase/admin";
import { analyse, loadEngagement } from "./engagement";

export type ListFilter = {
  tags_any?: string[]; tags_all?: string[]; tags_none?: string[];
  source?: string; state?: string; has_email?: boolean; has_phone?: boolean;
  created_within_days?: number; field?: string; q?: string;
};

type C = { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; company: string | null; tags: string[]; custom: Record<string, unknown>; source: string | null; created_at: string; email_opt_out: boolean; sms_opt_out: boolean; workspace_id: string };

/** Contacts matching a smart list filter. Capped at 5000 rows. */
export async function matchList(wsId: string, f: ListFilter): Promise<C[]> {
  const db = supabaseAdmin();
  let q = db.from("contacts").select("*").eq("workspace_id", wsId).limit(5000);
  if (f.tags_all?.length) q = q.contains("tags", f.tags_all);
  if (f.tags_any?.length) q = q.overlaps("tags", f.tags_any);
  if (f.source) q = q.eq("source", f.source);
  if (f.has_email) q = q.not("email", "is", null);
  if (f.has_phone) q = q.not("phone", "is", null);
  if (f.created_within_days) q = q.gte("created_at", new Date(Date.now() - f.created_within_days * 864e5).toISOString());
  if (f.q) q = q.or(`first_name.ilike.%${f.q}%,last_name.ilike.%${f.q}%,email.ilike.%${f.q}%,company.ilike.%${f.q}%`);
  let rows = ((await q).data ?? []) as C[];
  if (f.tags_none?.length) rows = rows.filter((c) => !f.tags_none!.some((t) => c.tags.includes(t)));
  if (f.field) {
    const [k, v] = f.field.split("=");
    rows = rows.filter((c) => String(c.custom?.[k.trim()] ?? "").toLowerCase() === (v ?? "").trim().toLowerCase());
  }
  if (f.state) {
    const { msgs, events, contacts } = await loadEngagement(wsId, 90);
    const st = new Map(analyse(msgs, events, contacts).rows.map((r) => [r.contact.id, r.state]));
    rows = rows.filter((c) => st.get(c.id) === f.state);
  }
  return rows;
}

/**
 * Complete smart-list result for the legacy bulk sender.
 * Unlike matchList(), query failures and server page limits MUST NOT be
 * interpreted as a verified empty list. Engagement-state lists are refused
 * because loadEngagement currently samples only 90 contacts.
 */
export async function matchListVerified(
  wsId: string, f: ListFilter,
): Promise<{ people: C[]; incomplete: boolean }> {
  if (!f || typeof f !== "object" || f.state) {
    return { people: [], incomplete: true };
  }
  const db = supabaseAdmin();
  let query = db.from("contacts").select("*", { count: "exact" })
    .eq("workspace_id", wsId).limit(5000);
  if (f.tags_all?.length) query = query.contains("tags", f.tags_all);
  if (f.tags_any?.length) query = query.overlaps("tags", f.tags_any);
  if (f.source) query = query.eq("source", f.source);
  if (f.has_email) query = query.not("email", "is", null);
  if (f.has_phone) query = query.not("phone", "is", null);
  if (f.created_within_days) {
    query = query.gte("created_at",
      new Date(new Date().getTime() - f.created_within_days * 864e5).toISOString());
  }
  if (f.q) query = query.or(
    "first_name.ilike.%" + f.q + "%,last_name.ilike.%" + f.q +
    "%,email.ilike.%" + f.q + "%,company.ilike.%" + f.q + "%",
  );
  const { data, count, error } = await query;
  // PostgREST may enforce a lower max_rows than .limit(5000).
  // Count only DB-filtered source rows before local filters are applied.
  if (error || count === null || count > 5000 || (data?.length ?? 0) !== count) {
    return { people: [], incomplete: true };
  }
  let rows = (data ?? []) as C[];
  if (f.tags_none?.length) rows = rows.filter(
    (c) => !f.tags_none!.some((tag) => c.tags.includes(tag)),
  );
  if (f.field) {
    const [key, value] = f.field.split("=");
    rows = rows.filter(
      (c) => String(c.custom?.[key.trim()] ?? "").toLowerCase() ===
        (value ?? "").trim().toLowerCase(),
    );
  }
  return { people: rows, incomplete: false };
}
