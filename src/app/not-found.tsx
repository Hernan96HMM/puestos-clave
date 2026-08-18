import Image from "next/image";
import Link from "next/link";
import { Card } from "@/components/ui/Card";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <Card className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <Image src="/sica-logo.png" alt="SICA" width={180} height={70} priority />
        <div>
          <h1 className="text-2xl font-bold text-primary">404</h1>
          <p className="mt-1 text-sm text-text-muted">No encontramos esta página.</p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
        >
          Volver al inicio
        </Link>
      </Card>
    </main>
  );
}
