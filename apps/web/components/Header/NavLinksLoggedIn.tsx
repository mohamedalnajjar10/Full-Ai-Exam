"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { authedGroups, authedHome, authedTrailingLinks, isActivePath, type NavGroup } from "./navConfig";

const LINK = "flex items-center gap-1.5 rounded-lg px-3 py-2 text-[15px] font-medium transition-colors";
const IDLE = "text-muted hover:bg-navy-50/60 hover:text-navy-900";
const ACTIVE = "bg-navy-50 text-navy-900";

function NavDropdown({ group, pathname }: { group: NavGroup; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const groupActive = group.items.some((i) => isActivePath(pathname, i.href));

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`${LINK} ${groupActive ? ACTIVE : IDLE}`}
      >
        {group.label}
        <ChevronDown size={15} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {/* جسر شفاف حتى لا تُغلق القائمة عند تحريك الماوس نحوها */}
      <div className={`absolute start-0 top-full z-50 pt-2 ${open ? "" : "pointer-events-none"}`}>
        <div
          className={`w-72 rounded-2xl border border-line bg-white p-2 shadow-float transition-all duration-150 ${
            open ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
          }`}
        >
          {group.items.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex items-start gap-3 rounded-xl p-3 transition-colors ${active ? "bg-navy-50" : "hover:bg-canvas"}`}
              >
                {Icon && (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-navy-900">
                    <Icon size={17} strokeWidth={1.75} />
                  </span>
                )}
                <span>
                  <span className="block text-sm font-semibold text-navy-900">{item.label}</span>
                  {item.description && <span className="block text-[13px] text-muted">{item.description}</span>}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function NavLinksLoggedIn() {
  const pathname = usePathname();
  const homeActive = isActivePath(pathname, authedHome.href);

  return (
    <nav aria-label="التنقل الرئيسي" className="hidden items-center gap-1 lg:flex">
      <Link href={authedHome.href} aria-current={homeActive ? "page" : undefined} className={`${LINK} ${homeActive ? ACTIVE : IDLE}`}>
        {authedHome.label}
      </Link>
      {authedGroups.map((g) => (
        <NavDropdown key={g.label} group={g} pathname={pathname} />
      ))}
      {authedTrailingLinks.map((link) => {
        const active = isActivePath(pathname, link.href);
        const isAi = link.href === "/ai-path";
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`${LINK} ${active ? ACTIVE : isAi ? "text-teal-700 hover:bg-teal-50" : IDLE}`}
          >
            {isAi && <Sparkles size={15} />}
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
