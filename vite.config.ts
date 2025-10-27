import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import svgr from "vite-plugin-svgr";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig(({ isSsrBuild }) => ({
    plugins: [
        tailwindcss(),
        reactRouter(),
        tsconfigPaths(),
        svgr(),
        visualizer({ open: true }),
    ],
    build: {
        chunkSizeWarningLimit: 1000,
        rollupOptions: isSsrBuild
            ? {
                  input: "./server/app.ts",
              }
            : undefined,
    },
}));
