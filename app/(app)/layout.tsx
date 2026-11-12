import { LogOut } from "lucide-react";
import { getWorkspaces, currentRole } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { ConfirmHost } from "@/components/shell/confirm-host";
import { ToastHost } from "@/components/shell/toast-host";
import { logout, switchWorkspace } from "../actions";
import { KydosWordmark } from "@/components/shell/logo";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import { WorkspaceSelect } from "@/components/shell/workspace-select";
import { CommandMenu } from "@/components/shell/command-menu";
import { ThemeToggle } from "@/components/shell/theme-toggle";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { all, active } = await getWorkspaces();
  const db = await supabaseServer();
  const { data: u } = await db.auth.getUser();
  const email = u.user?.email ?? "";
  const role = active ? await currentRole(active.id) : "member";
  const counts: Record<string, number> = {};
  if (active) {
    const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
    const [msgs, tasks, drafts] = await Promise.all([
      db.from("messages").select("contact_id").eq("workspace_id", active.id).eq("direction", "in").is("read_at", null).limit(1000),
      db.from("tasks").select("id", { count: "exact", head: true }).eq("workspace_id", active.id).eq("done", false).lte("due_at", endOfToday.toISOString()),
      db.from("agent_drafts").select("id", { count: "exact", head: true }).eq("workspace_id", active.id).eq("status", "pending"),
    ]);
    counts["/inbox"] = new Set((msgs.data ?? []).map((m) => m.contact_id)).size;
    counts["/tasks"] = tasks.count ?? 0;
    counts["/agent"] = drafts.count ?? 0;
  }
  const hidden = role === "member" ? ["/team", "/settings", "/usage", "/integrations"] : [];
  return (
    <div className="flex min-h-screen">
      <a href="#main" className="btn btn-primary sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50">Skip to content</a>
      <aside className="sticky top-0 flex h-screen w-[248px] shrink-0 flex-col bg-side-bg text-side-ink">
        <div className="flex flex-col gap-3 px-3 pb-3 pt-4">
          <KydosWordmark className="px-1.5 text-side-ink" />
          <form action={switchWorkspace}>
            <WorkspaceSelect options={all.map((w) => ({ id: w.id, name: w.name }))} value={active?.id} />
            <button className="sr-only">Switch business</button>
          </form>
          <CommandMenu />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4 pt-2 [scrollbar-color:rgba(255,255,255,0.15)_transparent]">
          <SidebarNav counts={counts} hidden={hidden} />
        </div>
        <div className="flex items-center justify-between border-t border-side-line px-3 py-2.5">
          {email && <a href="/account" title="Your account and two-factor sign-in" className="mr-2 min-w-0 flex-1 rounded-md leading-tight hover:bg-side-hover"><div className="truncate text-[12px] font-medium text-side-ink">{email}</div><div className="text-[11px] capitalize text-side-muted">{role}</div></a>}
          <form action={logout}>
            <button className="flex h-8 items-center gap-2 rounded-lg px-2.5 text-[13px] font-medium text-side-muted transition-colors hover:bg-side-hover hover:text-side-ink">
              <LogOut className="h-4 w-4" aria-hidden /><span className="sr-only">Sign out</span>
            </button>
          </form>
          <ThemeToggle />
        </div>
      </aside>
      <ConfirmHost />
      <ToastHost />
      <main id="main" className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
