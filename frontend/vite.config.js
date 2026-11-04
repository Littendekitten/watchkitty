import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// On GitHub Pages a project site lives at /<repo-name>/, so the workflow sets VITE_BASE.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || "/",
});
