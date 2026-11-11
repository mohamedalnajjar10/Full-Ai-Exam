"use client";
import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import Logo from "@/components/ui/Logo";

const SOCIAL = [
  {
    label: "Facebook",
    href: "https://facebook.com",
    path: "M9 8H6v4h3v12h5V12h3.642L18 8h-4V6.333C14 5.37 14.5 5 15.5 5H18V0h-3.808C10.59 0 9 1.589 9 4.706V8z",
  },
  {
    label: "Instagram",
    href: "https://instagram.com",
    path: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z",
  },
  {
    label: "X",
    href: "https://x.com",
    path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  },
  {
    label: "LinkedIn",
    href: "https://linkedin.com",
    path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 110-4.125 2.062 2.062 0 010 4.125zM7.119 20.452H3.555V9h3.564v11.452z",
  },
];

function Column({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <ul className="mt-4 flex flex-col gap-3">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-sm text-navy-200 transition-colors hover:text-white">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Footer({ compact = false }: { compact?: boolean }) {
  const { isLoggedIn } = useAuth();
  const year = new Date().getFullYear();

  if (compact) {
    return (
      <footer className="border-t border-line bg-white">
        <div className="container-page flex flex-col items-center justify-between gap-3 py-6 text-sm text-muted sm:flex-row">
          <p>© {year} مسار التميز — جميع الحقوق محفوظة.</p>
          <nav aria-label="روابط التذييل" className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link href="/faq" className="hover:text-navy-900">الأسئلة الشائعة</Link>
            <Link href="/contact" className="hover:text-navy-900">الدعم</Link>
            <Link href="/privacy" className="hover:text-navy-900">الخصوصية</Link>
            <Link href="/terms" className="hover:text-navy-900">الشروط</Link>
          </nav>
        </div>
      </footer>
    );
  }

  return (
    <footer className="bg-navy-950 text-navy-200">
      <div className="container-page grid gap-12 py-16 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1.2fr] lg:gap-8">
        <div className="max-w-xs">
          <Logo inverse href={isLoggedIn ? "/home" : "/"} />
          <p className="mt-5 text-sm leading-7 text-navy-200">
            منصتك للتحضير لامتحان التوجيهي: أسئلة على نمط الامتحانات الوزارية، مساعد ذكي، وخطة دراسية يومية لكل فرع.
          </p>
        </div>

        <Column
          title="المنصة"
          links={
            isLoggedIn
              ? [
                  { href: "/home", label: "لوحتي" },
                  { href: "/quizzes", label: "الكويزات" },
                  { href: "/ai-path", label: "مسار التميز AI" },
                  { href: "/daily-plan", label: "خطة اليوم" },
                ]
              : [
                  { href: "/#how", label: "كيف تعمل المنصة" },
                  { href: "/#features", label: "المزايا" },
                  { href: "/#branches", label: "الفروع" },
                  { href: "/register", label: "إنشاء حساب" },
                ]
          }
        />
        <Column
          title="الدعم"
          links={[
            { href: "/faq", label: "الأسئلة الشائعة" },
            { href: "/contact", label: "تواصل معنا" },
            { href: "/success-stories", label: "قصص النجاح" },
          ]}
        />
        <Column
          title="قانوني"
          links={[
            { href: "/terms", label: "الشروط والأحكام" },
            { href: "/privacy", label: "سياسة الخصوصية" },
          ]}
        />

        <div>
          <h3 className="text-sm font-semibold text-white">تواصل معنا</h3>
          <ul className="mt-4 flex flex-col gap-3 text-sm">
            <li>
              <a href="tel:0912345678" className="inline-flex items-center gap-2.5 transition-colors hover:text-white">
                <Phone size={16} className="text-teal-300" />
                <span dir="ltr">0912345678</span>
              </a>
            </li>
            <li>
              <a href="mailto:support@masar-altamayoz.edu" className="inline-flex items-center gap-2.5 break-all transition-colors hover:text-white">
                <Mail size={16} className="shrink-0 text-teal-300" />
                support@masar-altamayoz.edu
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-page flex flex-col-reverse items-center justify-between gap-4 py-6 text-sm sm:flex-row">
          <p className="text-navy-300">© {year} مسار التميز — جميع الحقوق محفوظة.</p>
          <ul className="flex items-center gap-2">
            {SOCIAL.map((s) => (
              <li key={s.label}>
                <a
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-navy-300 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24" aria-hidden>
                    <path d={s.path} />
                  </svg>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
