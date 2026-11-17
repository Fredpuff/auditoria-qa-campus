import { defineConfig, devices } from '@playwright/test';
import { WEB_URL } from './utils/entorno';

// Cada ejecución guarda sus reportes en resultados/<EJECUCION>/ (por defecto "local").
const EJECUCION = process.env.EJECUCION ?? 'local';
const salida = `resultados/${EJECUCION}`;

export default defineConfig({
  testDir: './tests',
  // Un solo worker y en orden: los casos comparten la base y el límite de 10 ingresos por minuto.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  globalSetup: './global-setup.ts',
  outputDir: `${salida}/artefactos`,
  reporter: [
    ['list'],
    ['html', { outputFolder: `${salida}/html`, open: 'never' }],
    ['json', { outputFile: `${salida}/resultados.json` }],
    ['junit', { outputFile: `${salida}/junit.xml` }],
  ],
  use: {
    baseURL: WEB_URL,
    // Playwright no tiene 'retain-on-failure' para capturas; 'only-on-failure' es el equivalente.
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    locale: 'es-CO',
  },
  projects: [
    // "preparacion" tiene como teardown a "limite-ingreso": así el bloqueo de 10 ingresos por minuto
    // corre siempre al final, después de api y e2e, aunque haya casos fallidos.
    { name: 'preparacion', testDir: './tests/preparacion', testMatch: /.*\.setup\.ts/, teardown: 'limite-ingreso' },
    { name: 'api', testDir: './tests/api', dependencies: ['preparacion'] },
    { name: 'e2e', testDir: './tests/e2e', dependencies: ['preparacion'], use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'limite-ingreso', testDir: './tests/limite' },
  ],
});
