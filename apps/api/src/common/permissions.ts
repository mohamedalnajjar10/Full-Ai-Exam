import { Role } from '@prisma/client';
import {
  ALL_PERMISSIONS,
  SUPER_ADMIN_ROLE_ID,
  isPermission,
  type Permission,
} from '@ai-exam/types';

/**
 * الصلاحيات الفعلية لحساب. الطالب ما إله ولا وحدة؛ عضو الفريق بياخد
 * صلاحيات دوره (المعرّفات يلي ما عادت موجودة بالكتالوج بتنتجاهل)، والمدير
 * العام كلها — حتى يلي بتنضاف بعدين.
 */
export function effectivePermissions(user: {
  /** Role أو قيمته النصية (من كاش JWT) */
  role: string;
  staffRole?: { id: string; permissions: string[] } | null;
}): Permission[] {
  if (user.role !== Role.ADMIN || !user.staffRole) return [];
  if (user.staffRole.id === SUPER_ADMIN_ROLE_ID) return [...ALL_PERMISSIONS];
  return user.staffRole.permissions.filter(isPermission);
}
