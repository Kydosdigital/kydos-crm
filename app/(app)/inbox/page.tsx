import Link from "next/link";
import { requireWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";

export default async function Inbox() {
  const { ws } = await requireWorkspace();
  const db = await supabaseServer();
  const { data } = await db
    .from("messages")
    .select("*, contacts(id,first_name,last_name,email,phone)")
    .eq("workspace_id", ws.id)
    .order("created_at", { ascending: false })
    .limit(300);

  // Latest message per contact
  const seen = new Set<string>();
  const threads = (data ?? []).filter((m) => (seen.has(m.contact_id) ? false : (seen.add(m.contact_id), true)));

  return (
    <div className="max-w-3xl">
      <h1 className="mb-4 text-2xl font-semibold">Inbox</h1>
      {threads.length === 0 && <p className="text-gray-500">No messages yet.</p>}
      <ul className="divide-y rounded border">
        {threads.map((m) => {
          const c = m.contacts as { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null };
          return (
            <li key={m.id}>
              <Link href={`/contacts/${c.id}`} className="block p-3 hover:bg-gray-50">
                <div className="flex justify-between text-sm">
                  <span className={m.direction === "in" ? "font-semibold" : ""}>{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || c.phone}</span>
                  <span className="text-xs text-gray-500">{m.channel} | {new Date(m.created_at).toLocaleString("en-GB")}</span>
                </div>
                <div className="truncate text-sm text-gray-600">{m.direction === "out" ? "You: " : ""}{m.body}</div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
