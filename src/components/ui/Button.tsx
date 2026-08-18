"use client";

import type { ButtonHTMLAttributes } from "react";
import { motion } from "framer-motion";

type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart" | "onAnimationEnd" | "onAnimationIteration"
>;

interface ButtonProps extends NativeButtonProps {
  variant?: "primary" | "ghost";
}

const VARIANT_CLASSES: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover",
  ghost: "bg-transparent text-primary hover:bg-bg-subtle",
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.15 }}
      className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
