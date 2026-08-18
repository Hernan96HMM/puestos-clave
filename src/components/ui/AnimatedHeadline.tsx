"use client";

import { motion } from "framer-motion";

export function AnimatedHeadline({ text, className = "" }: { text: string; className?: string }) {
  const palabras = text.split(" ");
  return (
    <h1 className={`flex flex-wrap gap-x-2 ${className}`}>
      {palabras.map((palabra, i) => (
        <motion.span
          key={`${palabra}-${i}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08, duration: 0.35 }}
        >
          {palabra}
        </motion.span>
      ))}
    </h1>
  );
}
