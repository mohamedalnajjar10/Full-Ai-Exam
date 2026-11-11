/**
 * نسبة مئوية داخل جملة عربية. بدون العزل، الحروف العربية قبل الرقم
 * بتقلبه لـ"رقم عربي" حسب خوارزمية الاتجاه، فبتطلع "%90" بدل "90%".
 */
export default function Pct({ value, className = "" }: { value: number; className?: string }) {
  return (
    <bdi dir="ltr" className={className}>
      {value}%
    </bdi>
  );
}
