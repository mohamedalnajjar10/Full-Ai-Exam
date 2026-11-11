"use client";
import Link from "next/link";
import { Users } from "lucide-react";
import NavLinks from "./NavLinks";
import NavLinksLoggedIn from "./NavLinksLoggedIn";
import AuthButtons from "./AuthButtons";
import UserMenu from "./UserMenu";
import MobileMenu from "./MobileMenu";
import Logo from "@/components/ui/Logo";
import { useAuth } from "@/context/AuthContext";

export default function Header() {
  const { isLoggedIn, isLoading, hasParentSession } = useAuth();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-line/80 bg-white/90 backdrop-blur-md supports-[backdrop-filter]:bg-white/80">
      <div className="container-page flex h-16 items-center justify-between gap-6 lg:h-[72px]">
        <Logo href={isLoggedIn ? "/home" : "/"} priority />

        {isLoading ? (
          <div className="hidden h-4 w-96 animate-pulse rounded bg-canvas lg:block" />
        ) : isLoggedIn ? (
          <NavLinksLoggedIn />
        ) : (
          <NavLinks />
        )}

        <div className="flex items-center gap-2">
          {hasParentSession && (
            <Link
              href="/parent/dashboard"
              title="الانتقال السريع إلى لوحة متابعة ولي الأمر"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50/90 px-3 py-1.5 text-xs font-bold text-teal-800 transition hover:bg-teal-100 hover:border-teal-300 shadow-xs"
            >
              <Users size={14} className="text-teal-600" />
              <span>لوحة ولي الأمر</span>
            </Link>
          )}

          {isLoading ? (
            <div className="hidden h-10 w-40 animate-pulse rounded-xl bg-canvas lg:block" />
          ) : isLoggedIn ? (
            <UserMenu />
          ) : (
            <AuthButtons />
          )}
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
