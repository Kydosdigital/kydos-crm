import { LogOut } from "lucide-react";
import { getWorkspaces } from "@/lib/workspace";
import { logout, switchWorkspace } from "../actions";
import { KydosWordmark } from "@/components/shell/logo";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import { WorkspaceSelect } from "@/components/shell/workspace-select";
import { CommandMenu } from "@/components/shell/command-menu";
import { ThemeToggle } from "@/components/shell/theme-toggle";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { all, active } = await getWorkspaces();
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
          <SidebarNav />
        </div>
        <div className="flex items-center justify-between border-t border-side-line px-3 py-2.5">
          <form action={logout}>
            <button className="flex h-8 items-center gap-2 rounded-lg px-2.5 text-[13px] font-medium text-side-muted transition-colors hover:bg-side-hover hover:text-side-ink">
              <LogOut className="h-4 w-4" aria-hidden />Sign out
            </button>
          </form>
          <ThemeToggle />
        </div>
      </aside>
      <main id="main" className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
