import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP_DIR } from './entorno';

/** Carga las reglas de packages/shared de la aplicación (las mismas que usan la API y la web). */
export async function dominio(): Promise<any> {
  return import(pathToFileURL(path.join(APP_DIR, 'packages/shared/src/index.ts')).href);
}
