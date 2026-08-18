import Image from "next/image";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { query } from "@/lib/db/query";
import { puedeVerTodo } from "@/lib/permisos";
import { Button } from "@/components/ui/Button";
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

  const extendido = puedeVerTodo(session.user);
  const sectores = extendido
    ? await query<SectorRow>("select id, nombre, slug, orden from sector order by orden")
    : await query<SectorRow>("select id, nombre, slug, orden from sector where id = $1", [
        session.user.sectorId,
      ]);

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-bg">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 pt-4">
          <div className="flex items-center gap-2">
            <Image src="/sica-logo.png" alt="SICA" width={90} height={35} priority />
            <h1 className="text-lg font-bold text-primary">F-116 · Puestos Clave</h1>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button type="submit" variant="ghost">
              Cerrar sesión
            </Button>
          </form>
        </div>
        <Navbar
          sectores={sectores}
          rol={session.user.rol}
          sectorId={session.user.sectorId}
          mostrarDashboard={extendido}
        />
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
