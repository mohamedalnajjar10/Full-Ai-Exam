// Server Component: صفحة التعريف كاملة بتنرسم على السيرفر، وما فيها
// ولا مكتبة حركة ولا سلايدر — كل التفاعل (الأسئلة الشائعة) عناصر HTML أصلية.
import Hero from "@/components/landing/Hero";
import StatsBand from "@/components/landing/StatsBand";
import HowItWorks from "@/components/landing/HowItWorks";
import Features from "@/components/landing/Features";
import Branches from "@/components/landing/Branches";
import Testimonials from "@/components/landing/Testimonials";
import Faq from "@/components/landing/Faq";
import FinalCta from "@/components/landing/FinalCta";

export default function Home() {
  return (
    <>
      <Hero />
      <StatsBand />
      <HowItWorks />
      <Features />
      <Branches />
      <Testimonials />
      <Faq />
      <FinalCta />
    </>
  );
}
