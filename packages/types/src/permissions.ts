/**
 * صلاحيات فريق الإدارة — المصدر الوحيد للقائمة. الـ API بيفحصها بـ
 * @RequirePermissions، وصفحة «الأدوار والصلاحيات» بترسم المصفوفة منها.
 *
 * إضافة صلاحية: هون بس، وبعدين ربطها بالـ endpoint. الأدوار المخزّنة
 * بتحتفظ بالمعرّفات، فمعرّف بينحذف من هون بيتجاهله الفحص تلقائياً.
 */
export const PERMISSION_GROUPS = [
  {
    group: 'المحتوى',
    items: [
      { id: 'content.upload', label: 'رفع الكتب والامتحانات ومعالجتها' },
      { id: 'content.review', label: 'مراجعة الأسئلة المستخرجة' },
      { id: 'bank.edit', label: 'تعديل بنك الأسئلة' },
      { id: 'bank.delete', label: 'حذف من بنك الأسئلة' },
      { id: 'academics.manage', label: 'إدارة الفروع والمواد والمعلمين' },
    ],
  },
  {
    group: 'الذكاء الاصطناعي',
    items: [
      { id: 'ai.models', label: 'تغيير النماذج والمزوّد' },
      { id: 'ai.prompts', label: 'تعديل الموجّهات' },
      { id: 'ai.retrieval', label: 'إعدادات التقطيع والتضمين' },
    ],
  },
  {
    group: 'المستخدمون',
    items: [
      { id: 'users.view', label: 'عرض المستخدمين' },
      { id: 'users.manage', label: 'إيقاف وتعديل الحسابات ودعوة الفريق' },
      { id: 'roles.manage', label: 'إدارة الأدوار والصلاحيات' },
      { id: 'chats.view', label: 'قراءة المحادثات والإبلاغ عنها' },
    ],
  },
  {
    group: 'النظام',
    items: [
      { id: 'settings.edit', label: 'إعدادات المنصة' },
      { id: 'billing.view', label: 'عرض الاستهلاك والتكلفة' },
      { id: 'billing.manage', label: 'تعديل الحصص والميزانية' },
      { id: 'audit.view', label: 'سجل التدقيق' },
    ],
  },
] as const;

export type Permission = (typeof PERMISSION_GROUPS)[number]['items'][number]['id'];

export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.id));

export function isPermission(id: string): id is Permission {
  return (ALL_PERMISSIONS as string[]).includes(id);
}

/** دور المدير العام: كل الصلاحيات دائماً، حتى يلي بتنضاف لاحقاً */
export const SUPER_ADMIN_ROLE_ID = 'super_admin';

/** ملخص دور الفريق كما يرجع مع /users/me */
export interface StaffRoleSummary {
  id: string;
  name: string;
}
