import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { LandingPage } from "@/components/marketing/landing-page";

export default async function HomePage() {
  const { userId } = await auth();
  if (userId) {
    redirect("/inbox");
  }

  return <LandingPage />;
}
