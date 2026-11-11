import type { LucideIcon } from "lucide-react";
import {
  Atom,
  BookMarked,
  BookOpen,
  Dna,
  DraftingCompass,
  Factory,
  Feather,
  FlaskConical,
  Globe,
  Landmark,
  Languages,
  Library,
  Scale,
  ScrollText,
  Sigma,
} from "lucide-react";

/**
 * أيقونة كل مادة من اسمها.
 *
 * قبل: صور PNG مربوطة بمعرّفات فروع مكتوبة يدوياً بالكود — بعد أول seed
 * جديد تغيّرت المعرّفات، فصارت كل المواد تطلع بنفس أيقونة الدورق.
 * الاسم هو الشي الثابت الوحيد، فمنطابق عليه (بعد إزالة "ال" والهمزات).
 * الترتيب مهم: "أصول الفقه" لازم تنفحص قبل "الفقه".
 */
const RULES: [RegExp, LucideIcon][] = [
  [/رياضيات/, Sigma],
  [/فيزياء/, Atom],
  [/كيمياء/, FlaskConical],
  [/احياء|علوم حياتية/, Dna],
  [/انجليزي/, Languages],
  [/عربي/, Feather],
  [/اصول/, Library],
  [/فقه/, Scale],
  [/حديث/, ScrollText],
  [/اسلامي|دين|قران/, BookMarked],
  [/تاريخ/, Landmark],
  [/جغرافيا/, Globe],
  [/رسم|هندسي/, DraftingCompass],
  [/صناع/, Factory],
];

function normalize(name: string) {
  return name.replace(/[ً-ٰٟ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي");
}

export function subjectIcon(name: string): LucideIcon {
  const n = normalize(name);
  return RULES.find(([re]) => re.test(n))?.[1] ?? BookOpen;
}
