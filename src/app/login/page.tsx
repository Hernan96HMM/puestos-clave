import Image from "next/image";
import { Card } from "@/components/ui/Card";
import { AnimatedHeadline } from "@/components/ui/AnimatedHeadline";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <Card className="w-full max-w-sm">
        <div className="mb-4 flex flex-col items-center gap-3">
          <Image src="/sica-logo.png" alt="SICA" width={180} height={70} priority />
          <AnimatedHeadline text="F-116 · Puestos Clave" className="justify-center text-xl font-bold text-primary" />
        </div>
        <LoginForm />
      </Card>
    </main>
  );
}
