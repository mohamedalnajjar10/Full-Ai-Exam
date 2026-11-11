"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

/**
 * يظهر بس لما الطالب جاي من نموذج التسجيل: الموافقة بترجّعه والمربع
 * معلَّم (RegisterForm بيقرا acceptedTerms مرة وحدة وبيمسحها).
 */
export default function AcceptTermsBar() {
  const router = useRouter();
  function accept() {
    try {
      localStorage.setItem("acceptedTerms", "true");
    } catch {
      // التخزين محظور — الطالب بيعلّم المربع بنفسه
    }
    router.push("/register");
  }
  return (
    <div className="sticky bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur">
      <div className="container-page flex flex-col items-center justify-between gap-3 py-4 sm:flex-row">
        <p className="text-sm text-muted">قرأت الشروط؟ وافق عليها لتكمل إنشاء حسابك.</p>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button variant="secondary" onClick={() => router.push("/register")} className="flex-1 sm:flex-none">
            رجوع
          </Button>
          <Button onClick={accept} className="flex-1 sm:flex-none">
            أوافق وأكمل التسجيل
          </Button>
        </div>
      </div>
    </div>
  );
}
