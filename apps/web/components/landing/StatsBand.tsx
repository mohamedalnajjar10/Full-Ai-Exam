import { STATS } from "@/lib/content/testimonials";

export default function StatsBand() {
  return (
    <section aria-label="المنصة بالأرقام" className="border-b border-line bg-white">
      <dl className="container-page grid grid-cols-2 py-10 lg:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label} className="flex flex-col items-center gap-1 px-4 py-4 text-center lg:border-s lg:border-line lg:first:border-s-0">
            <dt className="order-2 text-sm text-muted">{s.label}</dt>
            <dd className="order-1 text-3xl font-bold text-navy-900 sm:text-4xl" dir="ltr">
              {s.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
