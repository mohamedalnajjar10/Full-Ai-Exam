/**
 * أسماء الفروع بقاعدة البيانات بدون "ال" (علمي، أدبي…). منضيفها هون حتى
 * تنقرا "الفرع العلمي" مش "الفرع علمي".
 */
export function branchLabel(name: string | null | undefined) {
  if (!name) return "";
  const n = name.trim();
  return `الفرع ${n.startsWith("ال") ? n : `ال${n}`}`;
}
