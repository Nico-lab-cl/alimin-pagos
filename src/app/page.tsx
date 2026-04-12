import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function Home() {
  const session = await auth();
  
  if (!session?.user) {
    redirect("/login");
  }
  
  const role = (session.user as any)?.role;
  if (role === "ADMIN") {
    redirect("/admin");
  } else {
    redirect("/user");
  }
}
