import { ArrowLeft } from "lucide-react";
import SectionHeading from "@/components/ui/SectionHeading";
import SubjectGlyph from "@/components/ui/SubjectGlyph";
import { buttonClass } from "@/components/ui/Button";
import Link from "next/link";
import { getBranchesWithSubjects } from "@/lib/serverData";
import { branchLabel } from "@/lib/branch";
import { SUBJECTS, countAr } from "@/lib/plural";

/** الفروع ومواد كل فرع كما هي بقاعدة البيانات — مش قائمة مكتوبة يدوياً. */
export default async function Branches() {
  const branches = await getBranchesWithSubjects();
  if (!branches?.length) return null;

  return (
    <section id="branches" className="bg-canvas py-20 lg:py-28">
      <div className="container-page">
        <SectionHeading
          eyebrow="الفروع الدراسية"
          title="محتوى مخصّص لمنهاج فرعك"
          description="اختر فرعك عند التسجيل، وستجد مواده جاهزة للتدريب من اليوم الأول."
        />

        <div className="mt-14 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {branches.map((b) => (
            <article key={b.id} className="reveal flex flex-col rounded-2xl border border-line bg-white shadow-card">
              <header className="flex items-center justify-between border-b border-line p-6">
                <h3 className="text-lg font-semibold text-navy-900">{branchLabel(b.name)}</h3>
                <span className="rounded-full bg-navy-50 px-2.5 py-1 text-xs font-medium text-navy-800">
                  {countAr(b.subjects.length, SUBJECTS)}
                </span>
              </header>
              <ul className="flex flex-1 flex-col gap-3 p-6">
                {b.subjects.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 text-[15px] text-ink">
                    <SubjectGlyph name={s.name} size="sm" />
                    {s.name}
                  </li>
                ))}
              </ul>
              <div className="p-6 pt-0">
                <Link href="/register" className={buttonClass({ variant: "secondary", block: true })}>
                  ابدأ مع {branchLabel(b.name)}
                  <ArrowLeft size={16} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
