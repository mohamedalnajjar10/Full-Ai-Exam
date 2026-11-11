import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@ai-exam/types';

export const PERMISSIONS_KEY = 'permissions';

export interface PermissionRequirement {
  /** all = كل الصلاحيات المذكورة؛ any = وحدة منها بتكفي */
  mode: 'all' | 'any';
  permissions: Permission[];
}

/**
 * صلاحيات لوحة التحكم المطلوبة للـ endpoint (كلها). بتتضمن إنو الحساب
 * من الفريق (ADMIN) — ما في داعي لـ @Roles(Role.ADMIN) معها.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata<string, PermissionRequirement>(PERMISSIONS_KEY, {
    mode: 'all',
    permissions,
  });

/** وحدة من الصلاحيات بتكفي — لقراءة بيانات بيحتاجها أكتر من دور */
export const RequireAnyPermission = (...permissions: Permission[]) =>
  SetMetadata<string, PermissionRequirement>(PERMISSIONS_KEY, {
    mode: 'any',
    permissions,
  });
