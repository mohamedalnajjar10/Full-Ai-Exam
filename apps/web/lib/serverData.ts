import { cookies } from "next/headers";
import type { Subject, Teacher, Paginated } from "@ai-exam/types";
import { API_ORIGIN } from "./apiBase";

/**
 * جلب بيانات الصفحة على السيرفر.
 *
 * قبل هيك كانت أقسام /home كلها تجيب بياناتها بالمتصفح بعد الـ hydration:
 * أسماء المواد يلي بتظهر بالـ HTML كانت البيانات الوهمية المحلية وبعدين
 * بتنستبدل (وميض وتغيّر تخطيط)، والمعلمين ما كانوا موجودين أصلاً لحد ما
 * يخلص الطلب. هون منجيبهم مع الصفحة، فأول رسمة بتكون البيانات الحقيقية.
 *
 * أي فشل بيرجّع null — الأقسام بتكمّل بالجلب من المتصفح كما قبل، فما
 * بتنكسر الصفحة لو الباك اند مش شغال.
 */
async function getJson<T>(path: string): Promise<T | null> {
  try {
    const cookieHeader = (await cookies()).toString();
    const res = await fetch(`${API_ORIGIN}/api/v1${path}`, {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function getSubjectsForBranch(branchId: string) {
  return getJson<Subject[]>(`/subjects/branch/${branchId}`);
}

export async function getTeachersPage(limit = 50, page = 1) {
  const result = await getJson<Paginated<Teacher>>(
    `/teachers?limit=${limit}&page=${page}`,
  );
  return result?.data ?? null;
}

/**
 * بيانات عامة (بدون جلسة) — منخزّنها 5 دقايق بدل ما نسأل الباك اند مع
 * كل زيارة للصفحة الرئيسية. الفروع والمواد ما بتتغيّر كل دقيقة.
 */
async function getPublicJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_ORIGIN}/api/v1${path}`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface BranchWithSubjects {
  id: string;
  name: string;
  subjects: { id: string; name: string }[];
}

/** كل الفروع مع موادها — طلب واحد (/subjects/all) بدل طلب لكل فرع. */
export async function getBranchesWithSubjects(): Promise<BranchWithSubjects[] | null> {
  const [branches, subjects] = await Promise.all([
    getPublicJson<{ id: string; name: string }[]>("/branches"),
    getPublicJson<(Subject & { branch?: { id: string; name: string } })[]>("/subjects/all"),
  ]);
  if (!branches) return null;
  return branches.map((b) => ({
    id: b.id,
    name: b.name,
    subjects: (subjects ?? [])
      .filter((s) => s.branchId === b.id)
      .map((s) => ({ id: s.id, name: s.name }))
      .sort((a, z) => a.name.localeCompare(z.name, "ar")),
  }));
}
