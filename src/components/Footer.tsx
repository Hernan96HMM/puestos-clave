import Image from "next/image";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border py-4">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 text-center">
        <Image src="/sica-logo.png" alt="SICA" width={70} height={27} />
        <p className="text-xs text-text-muted">© {new Date().getFullYear()} SICA — Industria para la energía</p>
      </div>
    </footer>
  );
}
