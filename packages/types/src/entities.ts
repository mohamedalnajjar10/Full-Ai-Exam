import type { Role } from './enums';
import type { Permission, StaffRoleSummary } from './permissions';

/**
 * Wire shapes: what the API actually serialises over HTTP.
 *
 * Dates are `string` here, not `Date`, because that is what survives
 * JSON.stringify. The old hand-copied frontend interfaces disagreed with the
 * backend on exactly this point.
 */

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  /** Serialised as `avatar` by the API. */
  avatar: string | null;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  /** Unused 2FA recovery codes left (0 when 2FA is off). */
  recoveryCodesRemaining?: number;
  /** false for accounts created with Google that never set a password. */
  hasPassword?: boolean;
  /** "google" for accounts created with Google sign-in. */
  oauthProvider?: string | null;
  branchId: string | null;
  branch?: BranchSummary | null;
  /** دور الفريق لحسابات ADMIN (null للطلاب) */
  staffRole?: StaffRoleSummary | null;
  /** صلاحيات لوحة التحكم الفعلية (فاضية للطلاب) */
  permissions?: Permission[];
}

export interface BranchSummary {
  id: string;
  name: string;
}

export interface Branch extends BranchSummary {
  createdAt: string;
  subjects?: Subject[];
}

export interface Subject {
  id: string;
  name: string;
  branchId: string;
  bookPdfKey: string | null;
  bookPdfOriginalName: string | null;
  bookPdfSize: number | null;
  createdAt: string;
  hasBook?: boolean;
}

export interface Teacher {
  id: string;
  name: string;
  title: string;
  bio: string;
  imageUrl: string;
  imageKey?: string;
  subjectId: string | null;
  subject: Subject | null;
  yearsOfExperience?: number;
  isActive: boolean;
  displayOrder?: number;
  createdAt: string;
  updatedAt: string;
}
