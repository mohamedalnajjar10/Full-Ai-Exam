import {
  Activity,
  BookOpenText,
  Bot,
  ClipboardCheck,
  Database,
  FileClock,
  Gauge,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  Layers,
  LifeBuoy,
  MessagesSquare,
  ScrollText,
  Settings2,
  ShieldCheck,
  SquareTerminal,
  UploadCloud,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { AuthUser, Permission } from "@ai-exam/types";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** عدّاد جنب الرابط — مثلاً أسئلة بانتظار المراجعة */
  badge?: string;
  keywords?: string;
  /** وحدة من هالصلاحيات بتكفي لعرض الصفحة؛ فاضي = أي عضو فريق */
  perms?: Permission[];
  /** الصفحة لسا ببيانات تجريبية (غير مربوطة بالخادم) */
  mock?: boolean;
}

export const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "عام",
    items: [{ href: "/admin", label: "نظرة عامة", icon: LayoutDashboard, keywords: "dashboard overview" }],
  },
  {
    section: "المحتوى والمعرفة",
    items: [
      { href: "/admin/ingestion", label: "رفع ومعالجة الملفات", icon: UploadCloud, keywords: "upload pdf chunk embed", perms: ["content.upload"] },
      { href: "/admin/library", label: "مكتبة المصادر", icon: BookOpenText, keywords: "books exams library chunks", perms: ["content.upload", "content.review", "bank.edit"] },
      { href: "/admin/review", label: "مراجعة الأسئلة", icon: ClipboardCheck, keywords: "staging approve review", perms: ["content.review"] },
      { href: "/admin/bank", label: "بنك الأسئلة", icon: Database, keywords: "question bank", perms: ["bank.edit", "bank.delete", "content.review"] },
    ],
  },
  {
    section: "الذكاء الاصطناعي",
    items: [
      { href: "/admin/ai", label: "النماذج والتوجيه", icon: Bot, keywords: "models openrouter provider fallback", perms: ["ai.models"] },
      { href: "/admin/ai/retrieval", label: "التقطيع والتضمين", icon: Layers, keywords: "rag chunking embedding retrieval vector", perms: ["ai.retrieval"] },
      { href: "/admin/ai/prompts", label: "الموجّهات", icon: SquareTerminal, keywords: "prompts templates", perms: ["ai.prompts"] },
      { href: "/admin/ai/guardrails", label: "الحواجز والسياسات", icon: ShieldCheck, keywords: "guardrails safety off-topic", perms: ["ai.prompts"] },
    ],
  },
  {
    section: "المنصة",
    items: [
      { href: "/admin/academics", label: "الفروع والمواد", icon: GraduationCap, keywords: "branches subjects units teachers", perms: ["academics.manage"] },
      { href: "/admin/users", label: "المستخدمون", icon: Users, keywords: "users students accounts", perms: ["users.view"] },
      { href: "/admin/roles", label: "الأدوار والصلاحيات", icon: KeyRound, keywords: "roles permissions rbac", perms: ["roles.manage"] },
      { href: "/admin/support", label: "تذاكر الدعم", icon: LifeBuoy, keywords: "support tickets help contact messages", perms: ["users.view"] },
      { href: "/admin/conversations", label: "المحادثات", icon: MessagesSquare, keywords: "chats conversations monitor", perms: ["chats.view"] },
      { href: "/admin/usage", label: "الاستهلاك والحصص", icon: Gauge, keywords: "usage quota cost tokens billing", perms: ["billing.view"] },
    ],
  },
  {
    section: "النظام",
    items: [
      { href: "/admin/settings", label: "الإعدادات", icon: Settings2, keywords: "settings site auth email storage maintenance flags", perms: ["settings.edit"] },
      { href: "/admin/health", label: "صحة النظام", icon: Activity, keywords: "health queues workers status", perms: ["settings.edit"] },
      { href: "/admin/audit", label: "سجل التدقيق", icon: ScrollText, keywords: "audit log history", perms: ["audit.view"] },
    ],
  },
];

export const ALL_NAV = NAV.flatMap((s) => s.items);

/** إجراءات سريعة بلوحة الأوامر (Ctrl+K) */
export const QUICK_ACTIONS: NavItem[] = [
  { href: "/admin/ingestion?new=exam", label: "رفع ملف امتحان جديد", icon: UploadCloud, perms: ["content.upload"] },
  { href: "/admin/ingestion?new=book", label: "رفع كتاب مدرسي", icon: BookOpenText, perms: ["content.upload"] },
  { href: "/admin/users?invite=1", label: "دعوة عضو فريق", icon: Users, perms: ["users.manage"] },
  { href: "/admin/ai#routing", label: "تغيير نموذج توليد الأسئلة", icon: Bot, perms: ["ai.models"] },
  { href: "/admin/settings#maintenance", label: "تفعيل وضع الصيانة", icon: FileClock, perms: ["settings.edit"] },
];

/** عضو فريق (ADMIN) — الطالب ما بيدخل لوحة التحكم أصلاً */
export function isStaff(user: AuthUser | null | undefined): boolean {
  return user?.role === "ADMIN";
}

/** وحدة من الصلاحيات بتكفي (نفس RequireAnyPermission بالخادم) */
export function can(user: AuthUser | null | undefined, ...perms: Permission[]): boolean {
  if (!isStaff(user)) return false;
  if (perms.length === 0) return true;
  const mine = new Set(user!.permissions ?? []);
  return perms.some((p) => mine.has(p));
}

export function canSee(user: AuthUser | null | undefined, item: NavItem): boolean {
  return can(user, ...(item.perms ?? []));
}

/** القائمة كما بيشوفها هالمستخدم — الأقسام الفاضية بتختفي */
export function navFor(user: AuthUser | null | undefined) {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => canSee(user, i)) })).filter((g) => g.items.length);
}
