import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config";

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    outDir: "dist",
    minify: "esbuild", // Uses esbuild internally for minification
    // The CRX plugin handles bundling into as few files as possible
    rollupOptions: {
      output: {
        // Adjust output filenames if needed
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
