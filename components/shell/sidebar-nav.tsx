"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "./nav";

/** Grouped navigation with the current section highlighted. Client component only so it can read the pathname. */
export function SidebarNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {NAV.map((group, gi) => (
        <div key={group.label ?? gi}>
          {group.label && <div className="mb-1 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-side-muted/75">{group.label}</div>}
          <ul className="flex flex-col gap-px">
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + "/");
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`group relative flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium outline-offset-0 transition-colors ${active ? "bg-side-active text-white" : "text-side-muted hover:bg-side-hover hover:text-side-ink"}`}
                  >
                    {active && <span aria-hidden className="absolute -left-3 top-1.5 h-5 w-[3px] rounded-r-full bg-spark" />}
                    <Icon className={`h-4 w-4 shrink-0 ${active ? "text-spark" : "opacity-80 group-hover:opacity-100"}`} aria-hidden />
                    <span className="truncate">{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
