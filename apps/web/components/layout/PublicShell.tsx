// غلاف الصفحات العامة (تواصل، أسئلة شائعة، خصوصية...) — متاحة للجميع
import Header from "@/components/Header/Header";
import Footer from "@/components/Footer/Footer";

export default function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <Header />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}
