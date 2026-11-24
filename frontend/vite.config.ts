import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'

// Overridable so parallel worktrees can run `make dev` side by side.
const backendPort = process.env.BACKEND_PORT ?? '8000'
const frontendPort = Number(process.env.FRONTEND_PORT ?? '5173')

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: frontendPort,
    strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${backendPort}` },
  },
  // e2e/ holds the Playwright suite (`make e2e`), not Vitest tests.
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], exclude: [...configDefaults.exclude, 'e2e/**'] },
})
