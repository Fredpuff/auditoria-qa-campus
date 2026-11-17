// Mide la cobertura de código de la API mientras corre la suite de Playwright.
//   node cobertura/ejecutar-con-cobertura.mjs            → una ejecución
//   node cobertura/ejecutar-con-cobertura.mjs 3          → tres ejecuciones seguidas (ejecucion-1..3)
// Requisitos: la base en Docker y la web (npm run dev -w @campus/web) encendidas; el puerto 4000 libre.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(aqui, '..');
const APP_DIR = process.env.APP_DIR ?? path.resolve(RAIZ, '../../Hackaton');
const API_DIR = path.join(APP_DIR, 'apps/api');
const REPORTE = path.join(RAIZ, 'cobertura/reporte-api');
const veces = Number(process.argv[2] ?? 1);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const win = process.platform === 'win32';

async function apiArriba() {
  try { return (await fetch('http://localhost:4000/api/health')).ok; } catch { return false; }
}

if (await apiArriba()) {
  console.error('Ya hay una API en el puerto 4000. Apágala (npm run dev) antes de medir la cobertura.');
  process.exit(1);
}

// c8 se ejecuta con cwd = apps/api para que las rutas del reporte queden como src/...
// --all incluye también los archivos que la suite nunca cargó (cuentan como 0 %).
// Única exclusión: src/scripts/ (el simulador de reportes de la demo, que no forma parte del servidor).
const c8 = spawn(
  'npx',
  [
    'c8', '--all', '--src', 'src', '--include', 'src/**/*.ts', '--exclude', 'src/scripts/**',
    '--reporter=html', '--reporter=text', '--reporter=text-summary', '--reporter=json-summary',
    '--report-dir', REPORTE, '--temp-directory', path.join(RAIZ, 'cobertura/.v8'),
    'node', '--import', 'tsx', path.join(aqui, 'servidor-api.mjs'),
  ],
  { cwd: API_DIR, stdio: ['ignore', 'pipe', 'inherit'], shell: win, env: { ...process.env, APP_DIR } },
);
let salidaC8 = '';
c8.stdout.on('data', (d) => { salidaC8 += d; });

for (let i = 0; i < 60 && !(await apiArriba()); i++) await esperar(1000);
if (!(await apiArriba())) { console.error('La API no arrancó bajo c8'); c8.kill(); process.exit(1); }
console.log('[cobertura] API arriba con c8');

const resultados = [];
for (let n = 1; n <= veces; n++) {
  const nombre = veces === 1 ? 'cobertura' : `ejecucion-${n}`;
  console.log(`\n[cobertura] Ejecución ${n} de ${veces} (${nombre})`);
  const inicio = Date.now();
  const codigo = await new Promise((r) => {
    const pw = spawn('npx', ['playwright', 'test'], { cwd: RAIZ, stdio: 'inherit', shell: win, env: { ...process.env, EJECUCION: nombre } });
    pw.on('exit', r);
  });
  resultados.push({ ejecucion: nombre, codigoSalida: codigo, minutos: +((Date.now() - inicio) / 60000).toFixed(1) });
}

writeFileSync(path.join(RAIZ, '.auth/detener-api'), 'parar');
await new Promise((r) => c8.on('exit', r));
mkdirSync(REPORTE, { recursive: true });
writeFileSync(path.join(REPORTE, 'resumen-consola.txt'), salidaC8);
writeFileSync(path.join(RAIZ, 'resultados/ejecuciones.json'), JSON.stringify(resultados, null, 2));
console.log(salidaC8.split('\n').filter((l) => /Statements|Branches|Functions|Lines|All files/.test(l)).join('\n'));
console.log(`\n[cobertura] Reporte HTML: ${path.join(REPORTE, 'index.html')}`);
