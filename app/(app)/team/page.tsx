import { requireAdmin } from "@/lib/workspace";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { inviteMember, removeMember } from "../../actions";
import { UserPlus } from "lucide-react";
import { Alert, Avatar, Badge, Card, CardTitle, Field, Page, PageHeader, TableCard, humanise } from "@/components/ui";

export default async function Team({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const { error, done } = await searchParams;
  const { ws } = await requireAdmin();
  const admin = supabaseAdmin();
  const { data: members } = await admin.from("workspace_members").select("user_id,role").eq("workspace_id", ws.id);
  const users = (await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })).data.users;
  const email = (id: string) => users.find((u) => u.id === id)?.email ?? id;
  return (
    <Page>
      <PageHeader title="Team" meta={<Badge tone="outline">{(members ?? []).length}</Badge>} description="Owners and admins can change settings, automations, forms and delete contacts. Members can work contacts, inbox, pipeline, tasks and send messages. Team members only see this business." />
      {error && <Alert tone="danger">{error}</Alert>}
      {done && <Alert tone="success">Invite sent. They will get an email to set a password.</Alert>}
      <div className="grid grid-cols-[minmax(0,1fr)_380px] items-start gap-6">
        <TableCard>
          <table className="table"><thead><tr><th>Member</th><th>Role</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
            {(members ?? []).map((m) => (
              <tr key={m.user_id}><td><span className="flex items-center gap-3"><Avatar name={email(m.user_id)} /><span className="font-medium text-ink">{email(m.user_id)}</span></span></td><td><Badge tone={m.role === "owner" ? "brand" : m.role === "admin" ? "info" : "neutral"}>{humanise(m.role)}</Badge></td>
                <td className="text-right">{m.role !== "owner" && <form action={removeMember}><input type="hidden" name="user_id" value={m.user_id} /><button className="btn btn-danger btn-sm">Remove</button></form>}</td></tr>
            ))}
          </tbody></table>
        </TableCard>
        <Card>
          <CardTitle icon={UserPlus}>Invite a teammate</CardTitle>
          <form action={inviteMember} className="flex flex-col gap-3">
            <Field label="Email"><input name="email" type="email" required placeholder="Email to invite" className="input" /></Field>
            <Field label="Role"><select name="role" className="select"><option value="member">Member</option><option value="admin">Admin</option></select></Field>
            <button className="btn btn-primary">Invite</button>
          </form>
        </Card>
      </div>
    </Page>
  );
}
