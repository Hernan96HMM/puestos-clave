import Link from "next/link";
import { Card } from "@/components/ui/Card";

export default function AppNotFound() {
  return (
    <Card className="flex flex-col items-center gap-3 py-10 text-center">
      <h1 className="text-2xl font-bold text-primary">404</h1>
      <p className="text-sm text-text-muted">No encontramos esta página, o no tenés acceso a ella.</p>
      <Link
        href="/"
        className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
      >
        Volver al inicio
      </Link>
    </Card>
  );
}
