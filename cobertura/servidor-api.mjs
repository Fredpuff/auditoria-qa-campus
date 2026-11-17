// Arranca la API auditada SIN modificar su código: solo importa apps/api/src/main.ts.
// Para apagarla de forma limpia (y que c8 pueda escribir la cobertura) se crea el archivo
// .auth/detener-api; entonces se emite SIGTERM dentro del proceso y la API ejecuta su propio
// apagado (main.ts cierra Fastify y llama a process.exit(0)). En Windows no se puede mandar
// SIGTERM desde otro proceso sin matarlo de golpe, por eso se usa el archivo.
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = process.env.APP_DIR ?? path.resolve(aqui, '../../../Hackaton');
const PARADA = path.resolve(aqui, '../.auth/detener-api');

rmSync(PARADA, { force: true });
setInterval(() => {
  if (existsSync(PARADA)) {
    rmSync(PARADA, { force: true });
    console.log('[cobertura] Señal de parada recibida, apagando la API');
    process.emit('SIGTERM');
  }
}, 500);

await import(pathToFileURL(path.join(APP_DIR, 'apps/api/src/main.ts')).href);
