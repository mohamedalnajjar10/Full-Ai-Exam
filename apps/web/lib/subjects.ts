"use client";
import { useEffect, useState } from "react";
import type { Subject as ApiSubject } from "@ai-exam/types";
import { useAuth } from "@/context/AuthContext";
import { apiUrl } from "./apiBase";
import { branchLabel } from "./branch";

export interface BranchSubject {
  id: string;
  name: string;
  hasBook: boolean;
}

function toBranchSubject(s: ApiSubject): BranchSubject {
  return { id: s.id, name: s.name, hasBook: Boolean(s.hasBook ?? s.bookPdfKey) };
}

/**
 * نفس الطلب ممكن ينطلب من أكتر من مكون بنفس الصفحة (القائمة الجانبية +
 * المحتوى…). منشارك الطلب الواحد، ومنحتفظ بالنتيجة دقيقة حتى التنقل بين
 * الصفحات ما يعيد التحميل كل مرة.
 */
const cache = new Map<string, { at: number; promise: Promise<BranchSubject[]> }>();
const TTL_MS = 60_000;

export function fetchBranchSubjects(branchId: string): Promise<BranchSubject[]> {
  const hit = cache.get(branchId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = fetch(apiUrl(`/subjects/branch/${branchId}`), { headers: { Accept: "application/json" } }).then(async (res) => {
    if (!res.ok) throw new Error(`subjects ${res.status}`);
    return ((await res.json()) as ApiSubject[]).map(toBranchSubject);
  });
  cache.set(branchId, { at: Date.now(), promise });
  promise.catch(() => cache.delete(branchId));
  return promise;
}

/**
 * مواد فرع الطالب الحالي — من الباك اند فقط.
 * كانت ترجع بيانات محلية وهمية عند الفشل، بمعرّفات ما بتصلح لأي طلب.
 */
export function useBranchSubjects(initial?: ApiSubject[] | null) {
  const { selectedBranch } = useAuth();
  const branchId = selectedBranch?.id;
  const [state, setState] = useState<{ subjects: BranchSubject[]; isLoading: boolean; error: string | null }>(() => ({
    subjects: initial ? initial.map(toBranchSubject) : [],
    isLoading: !initial,
    error: null,
  }));

  useEffect(() => {
    if (initial || !branchId) return;
    let cancelled = false;
    fetchBranchSubjects(branchId)
      .then((subjects) => !cancelled && setState({ subjects, isLoading: false, error: null }))
      .catch(() => !cancelled && setState({ subjects: [], isLoading: false, error: "تعذّر تحميل المواد الدراسية" }));
    return () => {
      cancelled = true;
    };
  }, [branchId, initial]);

  return { ...state, branchName: selectedBranch?.name, branchTitle: branchLabel(selectedBranch?.name) };
}
