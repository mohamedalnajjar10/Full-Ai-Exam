import Image from "next/image";
import Link from "next/link";

/**
 * شعار أفقي: الرمز (الكتاب والريشة) + اسم المنصة كنص حيّ.
 *
 * ملف الشعار الأصلي logo.png مقاسه 88×88 وفيه الاسم مكتوب تحت الرمز،
 * فبحجم الهيدر بيصير النص جواه غير مقروء ومغبّش على شاشات الريتنا.
 * public/brand/mark.png هو الرمز مقصوص من نفس الملف، والاسم منكتبه
 * بالخط، فبيضل حاد بأي حجم. لما يتوفّر الشعار بصيغة SVG، بس هاد الملف
 * بيتغيّر.
 */
export default function Logo({
  href = "/",
  size = "md",
  inverse = false,
  priority = false,
}: {
  href?: string;
  size?: "sm" | "md" | "lg";
  /** على خلفية كحلية */
  inverse?: boolean;
  priority?: boolean;
}) {
  const markH = size === "sm" ? 30 : size === "lg" ? 44 : 36;
  const markW = Math.round((markH * 69) / 55);
  const name = size === "sm" ? "text-base" : size === "lg" ? "text-2xl" : "text-lg";
  const tag = size === "lg" ? "text-[10px]" : "text-[8.5px]";

  return (
    <Link href={href} aria-label="مسار التميز — الصفحة الرئيسية" className="group inline-flex shrink-0 items-center gap-2.5">
      <span className={inverse ? "rounded-lg bg-white p-1 shadow-sm" : ""}>
        <Image
          src="/brand/mark.png"
          alt=""
          width={markW}
          height={markH}
          priority={priority}
          style={{ width: markW, height: markH }}
        />
      </span>
      <span className="flex flex-col leading-none">
        <span className={`font-bold ${name} ${inverse ? "text-white" : "text-navy-900"}`}>مسار التميز</span>
        <span
          dir="ltr"
          className={`mt-1 font-semibold uppercase tracking-[0.18em] ${tag} ${inverse ? "text-gold-400" : "text-gold-600"}`}
        >
          Path of Excellence
        </span>
      </span>
    </Link>
  );
}
