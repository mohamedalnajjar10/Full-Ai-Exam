import { ButtonLink } from "@/components/ui/Button";

export default function AuthButtons() {
  return (
    <div className="hidden items-center gap-2 lg:flex">
      <ButtonLink href="/login" variant="ghost" size="sm">
        تسجيل الدخول
      </ButtonLink>
      <ButtonLink href="/register" size="sm">
        أنشئ حسابك مجاناً
      </ButtonLink>
    </div>
  );
}
