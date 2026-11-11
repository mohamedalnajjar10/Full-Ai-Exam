import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Amiri, Amiri_Quran, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { AuthProvider } from "@/context/AuthContext";
import { getServerSession } from "@/lib/session";

// خط عربي مصمم للواجهات: أوضح بالأحجام الصغيرة وأرسمي من Cairo،
// وأرقامه اللاتينية مناسبة للإحصائيات والنتائج.
const plex = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-plex",
});

// خط المصحف للآيات ﴿…﴾ — مصمم لعلامات الضبط والوقف كاملة، وPlex بيرسمها
// متراكبة. ما منحمّله مسبقاً: بينزل بس بالصفحات يلي فيها آية.
const amiriQuran = Amiri_Quran({
  subsets: ["arabic"],
  weight: "400",
  display: "swap",
  preload: false,
  variable: "--font-amiri-quran",
});

// نسخ للنص المشكول بكثافة (شعر، أمثلة النحو والصرف) — الحركات بتوضح فيه
const amiri = Amiri({
  subsets: ["arabic"],
  weight: ["400", "700"],
  display: "swap",
  preload: false,
  variable: "--font-amiri",
});

export const metadata: Metadata = {
  title: {
    default: "مسار التميز — منصة التحضير لامتحان التوجيهي",
    template: "%s · مسار التميز",
  },
  description:
    "كويزات على نمط الامتحانات الوزارية، مساعد ذكي لكل مادة، وخطة دراسية يومية لطلاب التوجيهي في كل الفروع.",
  applicationName: "مسار التميز",
};

export const viewport: Viewport = {
  themeColor: "#002c5a",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // بنقرأ الجلسة على السيرفر ومنمررها كقيمة أولية، فأول رسمة بتكون صح
  const [user, cookieStore] = await Promise.all([getServerSession(), cookies()]);
  // ما في ولا كوكي جلسة؟ الزائر أكيد مش مسجّل، فما في داعي المتصفح يسأل
  // /users/me ويجرّب تجديد — كانوا طلبين 401 بكل صفحة عامة.
  const hasSessionCookie = cookieStore.has("access_token") || cookieStore.has("refresh_token");
  const hasParentSession = cookieStore.has("parent_access_token") || cookieStore.has("parent_refresh_token");

  return (
    <html lang="ar" dir="rtl" className={`${plex.variable} ${amiriQuran.variable} ${amiri.variable}`}>
      <body className="font-sans">
        <a
          href="#main"
          className="sr-only z-[200] rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
        >
          انتقل إلى المحتوى
        </a>
        <AuthProvider initialUser={user} hasSessionCookie={hasSessionCookie} initialHasParentSession={hasParentSession}>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
