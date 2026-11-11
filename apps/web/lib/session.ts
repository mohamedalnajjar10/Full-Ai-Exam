import { cookies } from "next/headers";
import type { AuthUser } from "@ai-exam/types";
import { API_ORIGIN } from "./apiBase";

/**
 * يقرأ الجلسة على السيرفر من كوكي access_token.
 *
 * هاد يلي بيخلّي الصفحات تنرسم على السيرفر وهي عارفة مين المستخدم، بدل
 * ما تستنى الـ hydration وطلب شبكة قبل ما تعرض أي شي.
 *
 * ملاحظة: cookies() صارت async بـ Next 16 (Async Request APIs).
 */
export async function getServerSession(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("access_token")?.value;
  if (!accessToken) return null;

  try {
    const res = await fetch(`${API_ORIGIN}/api/v1/users/me`, {
      headers: { cookie: `access_token=${accessToken}` },
      // الجلسة لازم تكون طازجة دايماً
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as AuthUser;
  } catch {
    // الباك اند مش شغال — منكمّل كزائر بدل ما نكسر الصفحة
    return null;
  }
}
