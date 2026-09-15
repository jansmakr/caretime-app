import { AppHeader } from "@/components/layout/AppHeader";
import { DemoNotice } from "@/components/common/DemoNotice";
import { HomeSearchForm } from "@/components/home/HomeSearchForm";

export default function HomePage() {
  return (
    <>
      <AppHeader />
      <DemoNotice />
      <main className="px-5 pt-8">
        <h2 className="text-[28px] font-extrabold leading-[1.3]">
          지금 어떤 상황인지
          <br />
          말씀해주세요.
        </h2>
        <HomeSearchForm />
      </main>
    </>
  );
}
