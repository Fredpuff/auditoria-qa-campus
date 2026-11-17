import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import usuarios from './datos/usuarios.json';
import { API_URL, APP_DIR, CLAVE, RUTA_SESIONES } from './utils/entorno';

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 1. Recarga los datos de ejemplo (los SLA vencen con el reloj, así que cada ejecución parte de cero).
 * 2. Inicia sesión una vez por usuario y guarda los tokens.
 * 3. Espera 61 s: la API guarda en caché el árbol de espacios 60 s (locations.service.ts) y el
 *    ingreso permite 10 intentos por minuto; así los casos arrancan con datos frescos y el contador en cero.
 */
export default async function globalSetup() {
  const salud = await fetch(`${API_URL}/api/health`).catch(() => null);
  if (!salud?.ok) throw new Error(`La API no responde en ${API_URL}. Enciéndela antes de correr las pruebas (ver README).`);

  if (process.env.SIN_SEED !== '1') {
    console.log(`[setup] Recargando datos de ejemplo en ${APP_DIR}`);
    execSync('npm run db:seed', { cwd: APP_DIR, stdio: 'inherit' });
  }

  let inicio = Date.now();
  const sesiones: Record<string, { token: string; user: { id: string; name: string; email: string; role: string } }> = {};
  for (const [rol, email] of Object.entries(usuarios)) {
    const ingresar = () =>
      fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: CLAVE }),
      });
    let r = await ingresar();
    if (r.status === 429) {
      // La ejecución anterior terminó con CP-43, que deja el ingreso bloqueado un minuto.
      const segundos = Number(r.headers.get('retry-after') ?? 60) + 2;
      console.log(`[setup] Ingreso bloqueado por la ejecución anterior; esperando ${segundos} s`);
      await esperar(segundos * 1000);
      inicio = Date.now();
      r = await ingresar();
    }
    if (r.status !== 200) throw new Error(`No se pudo iniciar sesión como ${rol}: HTTP ${r.status}`);
    sesiones[rol] = await r.json();
  }

  const restante = 61_000 - (Date.now() - inicio);
  if (restante > 0) {
    console.log(`[setup] Esperando ${Math.ceil(restante / 1000)} s (caché de espacios y límite de ingresos)`);
    await esperar(restante);
  }

  const arbol = await (await fetch(`${API_URL}/api/locations`, { headers: { authorization: `Bearer ${sesiones.supervisor.token}` } })).json();
  const espacios = arbol.flatMap((sede: any) =>
    sede.blocks.flatMap((bloque: any) =>
      bloque.spaces.map((e: any) => ({ id: e.id, code: e.code, name: e.name, type: e.type, floor: e.floor, capacity: e.capacity, qrToken: e.qrToken, bloque: bloque.code, sede: sede.code })),
    ),
  );
  mkdirSync(path.dirname(RUTA_SESIONES), { recursive: true });
  writeFileSync(RUTA_SESIONES, JSON.stringify({ creado: new Date().toISOString(), sesiones, espacios }, null, 2));
  console.log(`[setup] Listo: ${Object.keys(sesiones).length} sesiones y ${espacios.length} espacios`);
}
