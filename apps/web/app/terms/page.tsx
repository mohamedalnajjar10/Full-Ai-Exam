import type { Metadata } from "next";
import PublicShell from "@/components/layout/PublicShell";
import LegalPage, { type LegalSection } from "@/components/layout/LegalPage";
import AcceptTermsBar from "./AcceptTermsBar";

export const metadata: Metadata = { title: "الشروط والأحكام" };

const SECTIONS: LegalSection[] = [
  {
    id: "acceptance",
    title: "قبول الشروط",
    body: [
      "أهلاً بكم في منصة مسار التميز. باستخدامكم لهذه المنصة، فإنكم توافقون على الالتزام بالشروط والأحكام التالية.",
      "صُممت هذه الشروط لضمان بيئة تعليمية آمنة ومحترمة وفعّالة لجميع المستخدمين.",
    ],
  },
  {
    id: "use",
    title: "الاستخدام المقبول",
    body: [
      "يُتوقع من المستخدمين استخدام المنصة للأغراض التعليمية فقط.",
      "يُحظر منعاً باتاً أي إساءة استخدام للمنصة، بما في ذلك السلوك غير اللائق، أو مشاركة المحتوى الضار، أو انتهاك حقوق الآخرين.",
      "الاحترام المتبادل بين الطلاب والمعلمين وجميع المستخدمين أمرٌ أساسي.",
    ],
  },
  {
    id: "ip",
    title: "الملكية الفكرية",
    body: [
      "جميع المحتويات المتاحة على هذه المنصة، بما في ذلك الدورات والمواد والموارد، محمية بموجب حقوق الملكية الفكرية.",
      "لا يُسمح للمستخدمين بنسخ أو توزيع أو إعادة استخدام أي محتوى دون إذن مُسبق.",
    ],
  },
];

export default async function TermsPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  return (
    <PublicShell>
      <LegalPage
        eyebrow="الشروط والأحكام"
        title="الشروط والأحكام"
        description="يرجى قراءة هذه الشروط بعناية قبل استخدام المنصة."
        sections={SECTIONS}
      />
      {from === "register" && <AcceptTermsBar />}
    </PublicShell>
  );
}
