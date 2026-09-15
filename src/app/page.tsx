import { AppHeader } from "@/components/layout/AppHeader";
import { DemoNotice } from "@/components/common/DemoNotice";
import { HomeSearchForm } from "@/components/home/HomeSearchForm";

export default function HomePage() {
  return (
    <>
      <AppHeader />
      <DemoNotice />
      <main className="px-4 pt-7">
        <h2 className="text-[22px] font-bold leading-[1.4] tracking-tight">
          지금 어떤 상황인지
          <br />
          말씀해주세요.
        </h2>
        <HomeSearchForm />
      </main>
    </>
  );
}
