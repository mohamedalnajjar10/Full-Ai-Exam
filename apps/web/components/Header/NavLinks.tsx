"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { guestLinks } from "./navConfig";

export default function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="التنقل الرئيسي" className="hidden items-center gap-1 lg:flex">
      {guestLinks.map((link) => {
        const active = !link.href.includes("#") && pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-[15px] font-medium transition-colors ${
              active ? "bg-navy-50 text-navy-900" : "text-muted hover:bg-navy-50/60 hover:text-navy-900"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
