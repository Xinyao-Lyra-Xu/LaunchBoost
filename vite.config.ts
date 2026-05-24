import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: resolve(__dirname, "src/main.tsx"),
      output: {
        format: "iife",
        entryFileNames: "renderer.bundle.js",
        chunkFileNames: "chunk-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
