import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

/**
 * When a module is not mocked (VITE_MOCK), its paths are forwarded to that module's service.
 * Standalone ports come from doc 05; set VITE_INTEGRATED=1 after I1 to send everything to :8000.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const one = env.VITE_INTEGRATED === '1' ? 'http://localhost:8000' : null
  const M1 = one ?? env.VITE_M1_URL ?? 'http://localhost:8001'
  const M2 = one ?? env.VITE_M2_URL ?? 'http://localhost:8002'
  const M4 = one ?? env.VITE_M4_URL ?? 'http://localhost:8004'
  const to = (target: string, ws = false) => ({ target, changeOrigin: true, ws })
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
    server: {
      port: 5173,
      proxy: {
        '/ws': to(M1.replace(/^http/, 'ws'), true),
        '/api/scenarios': to(M1),
        '/api/alerts': to(M1),
        '/api/evidence/safety': to(M1),
        '/api/incidents': to(M2),
        '/api/demo': to(M2),
        '/api/tasks': to(M2),
        '/api/eta': to(M2),
        '/api/forecast': to(M2),
        '/api/operators': to(M2),
        '/api/shift': to(M2),
        '/api/evidence/analytics': to(M2),
        '/api': to(M4),
      },
    },
    build: { chunkSizeWarningLimit: 1500 },
  }
})
