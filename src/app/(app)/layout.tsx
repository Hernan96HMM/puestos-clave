import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db/query";
import { Navbar } from "./components/Navbar";

type SectorRow = {
  id: string;
  nombre: string;
  slug: string;
  orden: number;
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const sectores = await query<SectorRow>(
    "select id, nombre, slug, orden from sector order by orden"
  );

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-bg">
        <div className="mx-auto max-w-5xl px-4 pt-4">
          <h1 className="text-lg font-bold text-primary">F-116 · Puestos Clave</h1>
        </div>
        <Navbar sectores={sectores} rol={session.user.rol} sectorId={session.user.sectorId} />
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
