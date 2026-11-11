import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * حماية المسارات على السيرفر (Next.js 16 Proxy / Middleware).
 *
 * يعمل هذا الملف على مستوى الخادم قبل وصول الطلب لـ React أو إرسال الـ HTML:
 * 1. حماية صفحات الطالب والإدارة (/home, /assessments, /quizzes, /admin, إلخ) لمنع تسريب الـ bundle
 *    وتحويل الزائر غير الموثق فوراً إلى صفحة الدخول مع حفظ مسار العودة ?next=...
 * 2. حماية لوحة ولي الأمر (/parent/dashboard) والتأكد من وجود جلسة ولي الأمر.
 * 3. منع المستخدم المسجل من الوصول لصفحات تسجيل الدخول والتسجيل وإعادته إلى /home.
 * 4. إعادة توجيه المسار الميت /exams تلقائياً إلى /exams/archive لتفادي خطأ 404.
 */

const PROTECTED_PREFIXES = [
  "/home",
  "/ai-path",
  "/daily-plan",
  "/exams",
  "/quizzes",
  "/select-branch",
  "/account",
  "/assessments",
  "/admin",
];

const GUEST_ONLY_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const hasAccess = Boolean(request.cookies.get("access_token")?.value);
  const hasRefresh = Boolean(request.cookies.get("refresh_token")?.value);
  const hasParentAccess = Boolean(request.cookies.get("parent_access_token")?.value);
  const hasParentRefresh = Boolean(request.cookies.get("parent_refresh_token")?.value);

  // 1. تحويل المسار /exams إلى أرشيف الاختبارات /exams/archive مع الحفاظ على معلمات الاستعلام
  if (pathname === "/exams") {
    const targetUrl = request.nextUrl.clone();
    targetUrl.pathname = "/exams/archive";
    return NextResponse.redirect(targetUrl);
  }

  // 2. حماية مسارات بوابة ولي الأمر (/parent/dashboard)
  if (pathname.startsWith("/parent/dashboard")) {
    if (!hasParentAccess && !hasParentRefresh) {
      return NextResponse.redirect(new URL("/parent/login", request.url));
    }
    return NextResponse.next();
  }

  // 3. منع ولي الأمر المسجل من رؤية شاشة تسجيل دخول الوالدين
  if (pathname === "/parent/login" && (hasParentAccess || hasParentRefresh)) {
    return NextResponse.redirect(new URL("/parent/dashboard", request.url));
  }

  // 4. فحص المسارات المحمية للطالب والإدارة
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !hasAccess && !hasRefresh) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 5. تحويل المستخدم المسجل من الصفحة الرئيسية التعريفية إلى لوحته
  if (pathname === "/" && hasAccess) {
    return NextResponse.redirect(new URL("/home", request.url));
  }

  // 6. منع المستخدم المسجل من زيارة صفحات الدخول والتسجيل
  const isGuestOnly = GUEST_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (isGuestOnly && hasAccess) {
    return NextResponse.redirect(new URL("/home", request.url));
  }

  return NextResponse.next();
}

export default proxy;

export const config = {
  matcher: [
    /*
     * استثناء ملفات Next الثابتة، الصور، الفافيكون، والملفات ذات الامتداد
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
