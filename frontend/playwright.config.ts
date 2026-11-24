import { defineConfig, devices } from '@playwright/test'

// The suite gets its own ports, one above `make dev`'s, so it can run beside it.
const backendPort = Number(process.env.BACKEND_PORT ?? '8000') + 1
const frontendPort = Number(process.env.FRONTEND_PORT ?? '5173') + 1
// A throwaway database, wiped before every run so specs never see old data.
const dbPath = `e2e/.data/e2e-${backendPort}.db`

export default defineConfig({
  testDir: 'e2e',
  // One shared backend and database: run specs one at a time so history stays predictable.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${frontendPort}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // LLM_MODE=fake: no API key, no network, no cost. backend/.env is not needed.
      command: `rm -f ../frontend/${dbPath} && exec uv run uvicorn app.main:app --host 127.0.0.1 --port ${backendPort}`,
      cwd: '../backend',
      env: { LLM_MODE: 'fake', APP_DB_PATH: `../frontend/${dbPath}` },
      url: `http://127.0.0.1:${backendPort}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npx vite',
      env: { BACKEND_PORT: String(backendPort), FRONTEND_PORT: String(frontendPort) },
      url: `http://127.0.0.1:${frontendPort}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
