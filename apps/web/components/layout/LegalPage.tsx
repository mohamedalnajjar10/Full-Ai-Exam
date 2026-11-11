import Link from "next/link";
import PublicPageHeader from "./PublicPageHeader";

export interface LegalSection {
  id: string;
  title: string;
  body: string[];
}

/** تخطيط موحّد للشروط والخصوصية: فهرس ثابت جانبي وأقسام مرقّمة. */
export default function LegalPage({
  eyebrow,
  title,
  description,
  updated,
  sections,
  footer,
}: {
  eyebrow: string;
  title: string;
  description: string;
  updated?: string;
  sections: LegalSection[];
  footer?: React.ReactNode;
}) {
  return (
    <>
      <PublicPageHeader eyebrow={eyebrow} title={title} description={description}>
        {updated && <p className="text-sm text-muted">آخر تحديث: {updated}</p>}
      </PublicPageHeader>

      <div className="container-page grid gap-10 py-14 lg:grid-cols-[240px_1fr] lg:gap-16 lg:py-20">
        <nav aria-label="محتويات الصفحة" className="hidden lg:block">
          <p className="mb-3 text-sm font-semibold text-navy-900">في هذه الصفحة</p>
          <ol className="sticky top-28 flex flex-col gap-1 border-s border-line">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="-ms-px flex gap-2 border-s-2 border-transparent py-1.5 ps-4 text-sm text-muted transition-colors hover:border-navy-300 hover:text-navy-900"
                >
                  <span className="tabular text-subtle">{i + 1}.</span>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="max-w-3xl">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-28 border-b border-line py-8 first:pt-0 last:border-0">
              <h2 className="flex items-baseline gap-3 text-xl font-semibold text-navy-900">
                <span className="text-base text-teal-700 tabular">{String(i + 1).padStart(2, "0")}</span>
                {s.title}
              </h2>
              <ul className="mt-4 flex flex-col gap-3 ps-8">
                {s.body.map((line) => (
                  <li key={line} className="relative leading-8 text-ink before:absolute before:-start-4 before:top-3.5 before:h-1.5 before:w-1.5 before:rounded-full before:bg-teal-600">
                    {line}
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {footer ?? (
            <p className="mt-6 rounded-xl border border-line bg-canvas p-5 text-sm leading-7 text-muted">
              لأي استفسار حول هذه الصفحة{" "}
              <Link href="/contact" className="font-semibold text-navy-900 underline underline-offset-4">
                تواصل معنا
              </Link>
              .
            </p>
          )}
        </article>
      </div>
    </>
  );
}
