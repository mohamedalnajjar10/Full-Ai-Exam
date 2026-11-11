import type { Metadata } from "next";
import OAuthCallback from "./OAuthCallback";

export const metadata: Metadata = { title: "المصادقة عبر Google | مسار التميز" };

/**
 * صفحة استقبال نتيجة المصادقة عبر Google OAuth 2.0.
 * يوجه الباك اند المستخدم إلى هذا المسار مع معلمات الاستعلام (query parameters)
 * مثل ?success=true أو ?requires_two_factor=true أو ?error=...
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    requires_two_factor?: string;
    success?: string;
    status?: string;
    next?: string;
  }>;
}) {
  const { error, requires_two_factor, success, status, next } = await searchParams;
  const isSuccess = success === "true" || status === "success";

  return (
    <OAuthCallback
      error={error ?? null}
      requiresTwoFactor={requires_two_factor === "true"}
      success={isSuccess}
      next={next ?? null}
    />
  );
}
