import Link from "next/link";
import { getWorkspaces } from "@/lib/workspace";
import { logout, switchWorkspace } from "../actions";

const nav = [
  ["/contacts", "Contacts"],
  ["/pipeline", "Pipeline"],
  ["/tasks", "Tasks"],
  ["/inbox", "Inbox"],
  ["/broadcast", "Bulk email"],
  ["/templates", "Templates"],
  ["/snippets", "Snippets"],
  ["/automations", "Automations"],
  ["/forms", "Forms"],
  ["/lists", "Lists and fields"],
  ["/reports", "Reports"],
  ["/analytics", "Analytics"],
  ["/agent", "Comms agent"],
  ["/knowledge", "Knowledge base"],
  ["/activity", "Activity and calls"],
  ["/team", "Team"],
  ["/usage", "Usage"],
  ["/settings", "Settings"],
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { all, active } = await getWorkspaces();
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-[#e4e4df] bg-white p-4">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-[#1f3a5f] text-sm font-semibold text-white">K</span>
          <span className="font-semibold tracking-tight">Kydos CRM</span>
        </div>
        <form action={switchWorkspace} className="mb-4">
          <select name="ws" defaultValue={active?.id} className="w-full rounded border p-1 text-sm">
            {all.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <button className="mt-1 text-xs text-gray-500 underline">Switch business</button>
        </form>
        <nav className="flex flex-col gap-1">
          {nav.map(([href, label]) => (
            <Link key={href} href={href} className="rounded px-2 py-1.5 text-[#374151] hover:bg-[#f3f3ef]">{label}</Link>
          ))}
        </nav>
        <form action={logout} className="mt-6"><button className="text-sm text-gray-500 underline">Sign out</button></form>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
