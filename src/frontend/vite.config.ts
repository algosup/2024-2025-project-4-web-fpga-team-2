// frontend/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from 'path';

export default defineConfig({
  base: '/2024-2025-project-4-web-fpga-team-2-deployment/',
  server: {
    port: 5001,
    open: true,
    proxy: {
      "/api": {
        target: "https://two024-2025-project-4-web-fpga-team-2.onrender.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  root: resolve(__dirname), // Use absolute path
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico,txt,json,ts}"],
      },
      manifest: {
        name: "PWA Education App",
        short_name: "PWA App",
        description: "An offline-ready PWA for teachers & students",
        theme_color: "#ffffff",
        icons: [
          {
            src: "/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
  ],
});