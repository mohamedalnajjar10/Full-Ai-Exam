import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Logo from "@/components/ui/Logo";
import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main id="main" className="relative flex min-h-dvh flex-col bg-white">
      <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
      <div className="container-page relative flex h-16 items-center lg:h-[72px]">
        <Logo />
      </div>
      <div className="container-page relative flex flex-1 flex-col items-center justify-center py-16 text-center">
        <p className="text-sm font-semibold text-teal-700">خطأ 404</p>
        <h1 className="mt-3 text-balance text-[32px] font-bold leading-snug text-navy-900 sm:text-[40px]">يبدو أنك سلكت مساراً غير موجود</h1>
        <p className="mt-4 max-w-md text-lg leading-8 text-muted">الصفحة التي تبحث عنها غير متوفرة أو تم نقلها. لنعدك إلى طريق التميز.</p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/" size="lg">
            العودة للرئيسية
            <ArrowLeft size={18} />
          </ButtonLink>
          <ButtonLink href="/contact" variant="secondary" size="lg">
            تواصل معنا
          </ButtonLink>
        </div>
        <p className="mt-10 text-sm text-muted">
          هل أنت طالب مسجّل؟{" "}
          <Link href="/home" className="font-semibold text-teal-700 hover:underline">
            اذهب إلى لوحتك
          </Link>
        </p>
      </div>
    </main>
  );
}
