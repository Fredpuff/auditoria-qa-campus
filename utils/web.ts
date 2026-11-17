import type { Page, TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { sesion, type Rol, codigoCaso } from './fixtures';

/** Deja la sesión de un rol en el almacenamiento del navegador (igual que lo hace la web al ingresar). */
export async function entrarComo(page: Page, rol: Rol) {
  const s = sesion(rol);
  await page.addInitScript((valor) => {
    if (!sessionStorage.getItem('sesion-inyectada')) {
      localStorage.setItem('campus-auth', valor);
      sessionStorage.setItem('sesion-inyectada', '1');
    }
  }, JSON.stringify({ state: { token: s.token, user: s.user }, version: 0 }));
}

/** Guarda una captura en evidencias/capturas/<ejecución>/ y la adjunta al reporte. */
export async function captura(page: Page, info: TestInfo, sufijo = '') {
  const carpeta = path.resolve(__dirname, '../evidencias/capturas', process.env.EJECUCION ?? 'local');
  mkdirSync(carpeta, { recursive: true });
  const archivo = path.join(carpeta, `${codigoCaso(info)}${sufijo}.png`);
  await page.screenshot({ path: archivo });
  await info.attach(path.basename(archivo), { path: archivo, contentType: 'image/png' });
}
