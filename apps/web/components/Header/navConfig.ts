import type { LucideIcon } from "lucide-react";
import { Archive, BarChart3, Bot, CalendarCheck, Crown, House, Layers, ListChecks, ShieldCheck, Target } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon?: LucideIcon;
  description?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const guestLinks: NavItem[] = [
  { href: "/#how", label: "كيف تعمل المنصة" },
  { href: "/#features", label: "المزايا" },
  { href: "/#branches", label: "الفروع" },
  { href: "/subscriptions", label: "باقات الاشتراك 💎", icon: Crown },
  { href: "/success-stories", label: "قصص النجاح" },
  { href: "/faq", label: "الأسئلة الشائعة" },
];

export const authedHome: NavItem = { href: "/home", label: "الرئيسية", icon: House };

export const authedGroups: NavGroup[] = [
  {
    label: "الكويزات والتقييم",
    items: [
      { href: "/assessments", label: "تقييم القدرات", icon: Target, description: "اختبار تشخيصي معتمد وفق هرم بلوم" },
      { href: "/quizzes", label: "كويز جديد", icon: ListChecks, description: "أسئلة على نمط الوزارة بمستواك" },
      { href: "/quizzes/by-subject", label: "حسب المادة", icon: Layers, description: "مستواك في كل مادة على حدة" },
    ],
  },
  {
    label: "الاختبارات السابقة",
    items: [
      { href: "/exams/archive", label: "أرشيف الاختبارات", icon: Archive, description: "راجع إجاباتك وأعد المحاولة" },
      { href: "/exams/results", label: "نتائجي", icon: BarChart3, description: "تحليل أدائك وتقدّمك" },
    ],
  },
];

export const authedTrailingLinks: NavItem[] = [
  { href: "/daily-plan", label: "خطة اليوم", icon: CalendarCheck },
  { href: "/ai-path", label: "مسار التميز AI", icon: Bot },
  { href: "/subscriptions", label: "الاشتراكات 💎", icon: Crown },
];

/** بالقائمة الجانبية على الموبايل فقط — على الديسكتوب داخل قائمة الحساب */
export const accountLink: NavItem = { href: "/account", label: "الحساب والأمان", icon: ShieldCheck };

export function isActivePath(pathname: string, href: string) {
  return pathname === href;
}
