import { ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";

const PROMPTS = ["اشرح لي قانون نيوتن الثاني بمثال", "أعطني 5 أسئلة صعبة في الكيمياء", "حلّ هذا السؤال خطوة بخطوة"];

export default function AiPromo() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-navy-900 p-6 text-white">
      <div className="bg-grid-inverse absolute inset-0 [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_70%)]" />
      <div className="relative">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-teal-200 ring-1 ring-inset ring-white/15">
          <Sparkles size={13} />
          مسار التميز AI
        </span>
        <p className="mt-4 text-lg font-semibold leading-8">مساعدك الذكي في كل مادة</p>
        <ul className="mt-4 flex flex-col gap-2">
          {PROMPTS.map((p) => (
            <li key={p} className="rounded-lg bg-white/[0.07] px-3 py-2 text-sm text-navy-100 ring-1 ring-inset ring-white/10">
              «{p}»
            </li>
          ))}
        </ul>
        <Link href="/ai-path" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-white hover:underline">
          ابدأ محادثة
          <ArrowLeft size={16} />
        </Link>
      </div>
    </div>
  );
}
