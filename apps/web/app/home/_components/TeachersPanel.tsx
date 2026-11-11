import type { Teacher } from "@ai-exam/types";
import TeacherAvatar from "./TeacherAvatar";

export default function TeachersPanel({ teachers }: { teachers: Teacher[] }) {
  if (!teachers.length) return null;
  return (
    <section aria-labelledby="teachers-title">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 id="teachers-title" className="text-lg font-semibold text-navy-900">
            معلمو المنصة
          </h2>
          <p className="mt-0.5 text-sm text-muted">نخبة من المعلمين المتخصصين لمرافقتك في رحلتك</p>
        </div>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {teachers.map((t) => (
          <li key={t.id} className="flex gap-4 rounded-2xl border border-line bg-white p-5 shadow-card">
            <TeacherAvatar id={t.id} name={t.name} hasPhoto={Boolean(t.imageKey)} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-navy-900">{t.name}</p>
              <p className="truncate text-sm text-teal-700">{t.title}</p>
              {t.bio && <p className="mt-1.5 line-clamp-2 text-[13px] leading-6 text-muted">{t.bio}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
