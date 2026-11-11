import { Prisma } from '@prisma/client';

/**
 * الحقول الآمنة للإرجاع من أي endpoint.
 *
 * منستعمل `select` بدل ما نحذف الحقول بعد الجلب: الشي يلي ما بينجلب أصلاً
 * ما بيقدر يتسرّب. أي حقل جديد بالسكيما لازم يتضاف هون بشكل صريح حتى
 * يظهر بالردود — وهاد المقصود.
 *
 * ملاحظة: passwordHash وtwoFactorSecret وtwoFactorRecoveryCodes مقصودة
 * الغياب. /branches/select و/branches/change كانوا بيرجّعوا كائن المستخدم
 * الخام من Prisma، يعني الثلاثة كانوا بينزلوا بالرد.
 */
export const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  avatar: true,
  branchId: true,
  twoFactorEnabled: true,
  emailVerified: true,
  oauthProvider: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

/** نفس الحقول مع الفرع المرتبط ومواده. */
export const PUBLIC_USER_WITH_BRANCH_SELECT = {
  ...PUBLIC_USER_SELECT,
  branch: {
    select: {
      id: true,
      name: true,
      createdAt: true,
      subjects: { orderBy: { name: 'asc' } },
    },
  },
} satisfies Prisma.UserSelect;
