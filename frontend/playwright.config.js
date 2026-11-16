import {defineConfig} from '@playwright/test';
import process from 'node:process';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:5174',
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : 'chromium'),
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {command: process.platform === 'win32' ? '.\\.venv\\Scripts\\python.exe run_test_server.py' : '.venv/bin/python run_test_server.py', cwd: '../backend', url: 'http://127.0.0.1:5001/api/health', reuseExistingServer: false},
    {command: `npm run ${process.env.E2E_PREVIEW === '1' ? 'preview' : 'dev'} -- --port 5174 --strictPort`, url: 'http://127.0.0.1:5174', env: {API_PROXY_TARGET: 'http://127.0.0.1:5001'}, reuseExistingServer: false},
  ],
});
