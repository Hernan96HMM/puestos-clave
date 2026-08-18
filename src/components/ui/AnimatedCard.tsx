"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";

export function AnimatedCard({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  );
}
