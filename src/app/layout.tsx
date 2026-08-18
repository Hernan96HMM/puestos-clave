import type { Metadata } from "next";
import { Titillium_Web } from "next/font/google";
import "./globals.css";
import { Footer } from "@/components/Footer";

const titillium = Titillium_Web({
  variable: "--font-titillium",
  subsets: ["latin"],
  weight: ["300", "400", "600", "700"],
});

export const metadata: Metadata = {
  title: "F-116 · Puestos Clave",
  description: "Sistema de Gestión de Puestos Clave — SICA",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${titillium.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-bg text-text">
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
