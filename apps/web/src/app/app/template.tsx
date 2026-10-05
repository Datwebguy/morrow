"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

/** 150 ms crossfade between pages. */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
      {children}
    </motion.div>
  );
}
