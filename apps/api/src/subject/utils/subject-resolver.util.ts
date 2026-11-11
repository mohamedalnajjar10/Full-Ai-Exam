/**
 * Subject resolution utilities for resolving equivalent subjects across different
 * naming variations in the Palestinian curriculum (e.g., with or without the definite article "ال").
 */

interface CachedSubjectEquivalents {
  ids: string[];
  expiresAt: number;
}

const subjectEquivalentsCache = new Map<string, CachedSubjectEquivalents>();
const SUBJECT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache

/**
 * Clear the in-memory subject equivalents cache.
 * Useful when subjects are updated or in tests.
 */
export function clearSubjectResolverCache(): void {
  subjectEquivalentsCache.clear();
}

/**
 * Normalizes an Arabic subject name by:
 * 1. Removing leading definite article (الـ / ال)
 * 2. Normalizing hamzas (أ / إ / آ / ء / ئ / ؤ -> ا)
 * 3. Normalizing taa marbouta (ة -> ه)
 * 4. Normalizing whitespace
 */
export function normalizeSubjectName(name: string): string {
  return name
    .trim()
    .replace(/(?:^|\s)[\u0627\u0622\u0623\u0625]\u0644/g, ' ') // remove leading ال from words
    .replace(/[\u0623\u0625\u0622]/g, '\u0627') // normalize alifs
    .replace(/\u0629/g, '\u0647') // taa marbouta -> haa
    .replace(/[\u0621\u0626\u0624]/g, '') // strip trailing hamzas (e.g. كيمياء -> كيميا)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Given a subjectId, finds all equivalent subject IDs in the same branch.
 * For example:
 * - "كيمياء" and "الكيمياء"
 * - "رياضيات" and "الرياضيات"
 * - "فيزياء" and "الفيزياء"
 * - "أحياء" and "العلوم الحياتية"
 * Returns an array containing at least [subjectId].
 * Uses an In-Memory Map cache to prevent redundant database queries for static subject data.
 */
export async function getEquivalentSubjectIds(
  prisma: {
    subject: {
      findUnique: (args: any) => Promise<any>;
      findMany: (args: any) => Promise<any>;
    };
  },
  subjectId: string,
): Promise<string[]> {
  const now = Date.now();
  const cached = subjectEquivalentsCache.get(subjectId);
  if (cached && now < cached.expiresAt) {
    return cached.ids;
  }

  try {
    const current = await prisma.subject.findUnique({
      where: { id: subjectId },
      select: { id: true, name: true, branchId: true },
    });
    if (!current) {
      const fallback = [subjectId];
      subjectEquivalentsCache.set(subjectId, {
        ids: fallback,
        expiresAt: now + 30_000, // Short cache for missing subject
      });
      return fallback;
    }

    const norm = normalizeSubjectName(current.name);
    const peers = await prisma.subject.findMany({
      where: { branchId: current.branchId },
      select: { id: true, name: true },
    });

    const isBio = (s: string) => s.includes('احيا') || s.includes('علوم حياتي');

    const matches = peers
      .filter((p: { id: string; name: string }) => {
        const pNorm = normalizeSubjectName(p.name);
        if (pNorm === norm) return true;
        // Special handling for biology in scientific branch: أحياء <-> العلوم الحياتية
        if (isBio(pNorm) && isBio(norm)) {
          return true;
        }
        return false;
      })
      .map((p: { id: string }) => p.id);

    const result = matches.length > 0 ? matches : [subjectId];
    const cacheEntry: CachedSubjectEquivalents = {
      ids: result,
      expiresAt: now + SUBJECT_CACHE_TTL_MS,
    };

    // Populate cache for all matched IDs in the equivalence group
    for (const id of result) {
      subjectEquivalentsCache.set(id, cacheEntry);
    }

    return result;
  } catch {
    return [subjectId];
  }
}
