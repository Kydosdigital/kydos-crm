import { requireAdmin } from "@/lib/workspace";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { inviteMember, removeMember } from "../../actions";

export default async function Team({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const { error, done } = await searchParams;
  const { ws } = await requireAdmin();
  const admin = supabaseAdmin();
  const { data: members } = await admin.from("workspace_members").select("user_id,role").eq("workspace_id", ws.id);
  const users = (await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })).data.users;
  const email = (id: string) => users.find((u) => u.id === id)?.email ?? id;
  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-2xl font-semibold">Team</h1>
      <p className="mb-4 text-sm text-gray-500">Owners and admins can change settings, automations, forms and delete contacts. Members can work contacts, inbox, pipeline, tasks and send messages. Team members only see this business.</p>
      {error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {done && <p className="mb-3 rounded bg-green-50 p-2 text-sm text-green-700">Invite sent. They will get an email to set a password.</p>}
      <table className="mb-6 w-full text-left text-sm"><tbody>
        {(members ?? []).map((m) => (
          <tr key={m.user_id} className="border-b"><td className="py-2">{email(m.user_id)}</td><td className="text-gray-500">{m.role}</td>
            <td className="text-right">{m.role !== "owner" && <form action={removeMember}><input type="hidden" name="user_id" value={m.user_id} /><button className="text-xs underline">Remove</button></form>}</td></tr>
        ))}
      </tbody></table>
      <form action={inviteMember} className="flex gap-2 text-sm">
        <input name="email" type="email" required placeholder="Email to invite" className="flex-1 rounded border p-2" />
        <select name="role" className="rounded border p-2"><option value="member">Member</option><option value="admin">Admin</option></select>
        <button className="rounded bg-black px-3 text-white">Invite</button>
      </form>
    </div>
  );
}
