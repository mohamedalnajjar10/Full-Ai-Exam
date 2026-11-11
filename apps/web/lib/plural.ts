/**
 * العدد مع المعدود بالعربي: 1 محاولة، 2 محاولتان، 3–10 محاولات، 11+ محاولة.
 * بدونها بتطلع "1 محاولات" أو "15 مواد".
 */
export function countAr(n: number, forms: { one: string; two: string; few: string; many: string }) {
  if (n === 0) return `0 ${forms.many}`;
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  const mod = n % 100;
  return `${n} ${mod >= 3 && mod <= 10 ? forms.few : forms.many}`;
}

export const ATTEMPTS = { one: "محاولة واحدة", two: "محاولتان", few: "محاولات", many: "محاولة" };
export const SUBJECTS = { one: "مادة واحدة", two: "مادتان", few: "مواد", many: "مادة" };
export const QUESTIONS = { one: "سؤال واحد", two: "سؤالان", few: "أسئلة", many: "سؤالاً" };
export const BOOKS = { one: "كتاب واحد", two: "كتابان", few: "كتب", many: "كتاباً" };
