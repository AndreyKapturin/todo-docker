import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // для dev-режима (npm run dev локально)
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
  // для dev в докере через vite (если оставишь отдельный dev-stage)
  // proxy не нужен — в проде всё через nginx
});