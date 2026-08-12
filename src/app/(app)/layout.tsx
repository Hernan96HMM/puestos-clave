import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db/query";
import { Navbar } from "./components/Navbar";

interface SectorRow {
  id: string;
  nombre: string;
  slug: string;
  orden: number;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const sectores = await query<SectorRow>(
    "select id, nombre, slug, orden from sector order by orden"
  );

  return (
    <div>
      <Navbar sectores={sectores} rol={session.user.rol} sectorId={session.user.sectorId} />
      <main>{children}</main>
    </div>
  );
}
