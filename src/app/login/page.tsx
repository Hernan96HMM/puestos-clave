import { Card } from "@/components/ui/Card";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-4 text-xl font-bold text-primary">F-116 · Puestos Clave</h1>
        <LoginForm />
      </Card>
    </main>
  );
}
