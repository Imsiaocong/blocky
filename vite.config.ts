import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { localAvatarApi } from './server/local-api.ts'

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [localAvatarApi({ comfyUrl: loadEnv(mode, process.cwd(), 'COMFYUI_').COMFYUI_URL }), react(), cloudflare()],
  server: { host: '127.0.0.1' },
}))
