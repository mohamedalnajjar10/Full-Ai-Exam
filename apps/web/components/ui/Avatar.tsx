/** صورة المستخدم أو أول حرفين من اسمه. */
export default function Avatar({
  name,
  src,
  size = 36,
  className = "",
}: {
  name?: string | null;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  // حرف واحد: الأحرف العربية المنفصلة جنب بعض ("ط ا") بتنقرا غريب
  const initials = (name ?? "").trim().charAt(0) || "؟";

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy-900 font-semibold text-white ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.36) }}
      aria-hidden
    >
      {src ? (
        // صورة Google/مزوّد خارجي — next/image بيرفضها بدون remotePatterns لكل مزوّد
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={size} height={size} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        initials
      )}
    </span>
  );
}
