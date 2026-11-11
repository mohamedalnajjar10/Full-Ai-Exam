import { createElement } from "react";
import { subjectIcon } from "@/lib/subjectIcon";

const SIZES = {
  sm: { box: "h-8 w-8 rounded-lg", icon: 16 },
  md: { box: "h-11 w-11 rounded-xl", icon: 20 },
  lg: { box: "h-14 w-14 rounded-2xl", icon: 26 },
};

/** أيقونة المادة بإطار موحّد — نفس الشكل بكل الصفحات. */
export default function SubjectGlyph({
  name,
  size = "md",
  tone = "teal",
}: {
  name: string;
  size?: keyof typeof SIZES;
  tone?: "teal" | "navy" | "inverse";
}) {
  const s = SIZES[size];
  const colors =
    tone === "navy"
      ? "bg-navy-50 text-navy-900 ring-navy-900/5"
      : tone === "inverse"
        ? "bg-white/10 text-white ring-white/15"
        : "bg-teal-50 text-teal-700 ring-teal-700/10";
  return (
    <span className={`flex shrink-0 items-center justify-center ring-1 ring-inset ${s.box} ${colors}`} aria-hidden>
      {/* createElement: الأيقونة مكوّن ثابت من الجدول، مش مكوّن بينخلق بكل render */}
      {createElement(subjectIcon(name), { size: s.icon, strokeWidth: 1.75 })}
    </span>
  );
}
