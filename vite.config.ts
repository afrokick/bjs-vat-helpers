import { defineConfig } from "vite";
import path from "node:path";
import { externalizeDeps } from 'vite-plugin-externalize-deps';
import pkg from './package.json';

export default defineConfig({
  plugins: [
    externalizeDeps({}),
  ],
  build: {
    minify: false,
    lib: {
      entry: path.resolve(__dirname, "src/main.ts"),
      fileName: "main",
      formats: ["es", "cjs"],
    },
  },
});