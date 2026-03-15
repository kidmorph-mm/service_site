// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    hmr: {
      protocol: "wss",
      host: "test.kidmorph.cloud",
      clientPort: 443,
    },
    // 최근 버전에서 호스트 차단(403)이 나는 경우가 있어, 필요하면 허용 목록 추가
    allowedHosts: ["3d.kidmorph.cloud"],
  },
});