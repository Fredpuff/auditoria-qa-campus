import { test as base, expect, type APIRequestContext, type APIResponse, type TestInfo } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { API_URL, RUTA_SESIONES } from './entorno';

export type Rol = 'supervisor' | 'tecnico1' | 'tecnico2' | 'estudiante1' | 'estudiante2' | 'estudiante3' | 'estudiante4' | 'estudiante5';
export interface Sesion { token: string; user: { id: string; name: string; email: string; role: string } }
export interface Espacio { id: string; code: string; name: string; type: string; floor: number; capacity: number; qrToken: string; bloque: string; sede: string }

interface DatosEjecucion { sesiones: Record<Rol, Sesion>; espacios: Espacio[] }
let cache: DatosEjecucion | null = null;
export function datosEjecucion(): DatosEjecucion {
  cache ??= JSON.parse(readFileSync(RUTA_SESIONES, 'utf8'));
  return cache!;
}
export const sesion = (rol: Rol) => datosEjecucion().sesiones[rol];

/** Busca un espacio por nombre; si el nombre se repite (Aula 101) se indica el bloque: "A/Aula 101". */
export function espacio(nombre: string): Espacio {
  const [bloque, n] = nombre.includes('/') ? nombre.split('/') : [null, nombre];
  const e = datosEjecucion().espacios.find((x) => x.name === n && (!bloque || x.bloque === bloque));
  if (!e) throw new Error(`No existe el espacio ${nombre}`);
  return e;
}

/**
 * La API admite 30 reportes nuevos por minuto desde una misma IP (incidents.routes.ts).
 * Para no chocar con esa regla, que es correcta, se lleva la cuenta en un archivo
 * (Playwright reinicia el worker después de cada fallo) y se espera cuando se llega a 28.
 */
const RUTA_TURNOS = path.resolve(path.dirname(RUTA_SESIONES), 'reportes-creados.json');
export async function esperarTurnoDeReporte() {
  let marcas: number[] = [];
  try { marcas = JSON.parse(readFileSync(RUTA_TURNOS, 'utf8')); } catch { /* primera vez */ }
  marcas = marcas.filter((t) => Date.now() - t < 61_000);
  if (marcas.length >= 28) {
    const espera = 61_000 - (Date.now() - marcas[marcas.length - 28]);
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    marcas = marcas.filter((t) => Date.now() - t < 61_000);
  }
  marcas.push(Date.now());
  writeFileSync(RUTA_TURNOS, JSON.stringify(marcas));
}

interface Paso { n: number; peticion: string; quien: string; cuerpo?: unknown; estado: number; respuesta: unknown; ms: number }
export type Como = Rol | { token: string; etiqueta: string } | null;
interface Opciones { como?: Como; body?: unknown; headers?: Record<string, string> }
export interface Respuesta<T = any> { status: number; body: T; headers: Record<string, string> }

function resumir(valor: unknown): unknown {
  if (Array.isArray(valor)) {
    return {
      total: valor.length,
      primeros: valor.slice(0, 3).map((x: any) =>
        x && typeof x === 'object' && 'code' in x ? { code: x.code, status: x.status, isOverdue: x.isOverdue, priorityLevel: x.priorityLevel } : x,
      ),
    };
  }
  if (typeof valor === 'string' && valor.length > 400) return `${valor.slice(0, 400)}… (${valor.length} caracteres)`;
  if (valor && typeof valor === 'object') {
    return JSON.parse(
      JSON.stringify(valor, (k, v) =>
        k === 'token' && typeof v === 'string'
          ? `${v.slice(0, 20)}…`
          : typeof v === 'string' && v.length > 300
            ? `${v.slice(0, 300)}… (${v.length} caracteres)`
            : v,
      ),
    );
  }
  return valor;
}

/** Cliente de la API que deja en la bitácora cada petición y su respuesta (evidencia del caso). */
export class ClienteApi {
  readonly pasos: Paso[] = [];
  constructor(private readonly request: APIRequestContext) {}

  private cabeceras(como: Como | undefined, extra: Record<string, string> = {}) {
    const h: Record<string, string> = { ...extra };
    if (como) h.authorization = `Bearer ${typeof como === 'string' ? sesion(como).token : como.token}`;
    return h;
  }
  private quien(como: Como | undefined) {
    return !como ? 'sin sesión' : typeof como === 'string' ? como : como.etiqueta;
  }
  private async registrar(metodo: string, ruta: string, como: Como | undefined, cuerpo: unknown, inicio: number, r: APIResponse): Promise<Respuesta> {
    const tipo = r.headers()['content-type'] ?? '';
    let body: any;
    if (tipo.startsWith('image/')) {
      body = `[imagen ${tipo}, ${(await r.body()).length} bytes]`;
    } else {
      const texto = await r.text();
      try { body = texto ? JSON.parse(texto) : null; } catch { body = texto; }
    }
    this.pasos.push({ n: this.pasos.length + 1, peticion: `${metodo} ${ruta}`, quien: this.quien(como), cuerpo: resumir(cuerpo), estado: r.status(), respuesta: resumir(body), ms: Date.now() - inicio });
    return { status: r.status(), body, headers: r.headers() };
  }

  async llamar(metodo: 'GET' | 'POST' | 'PATCH', ruta: string, o: Opciones = {}): Promise<Respuesta> {
    if (metodo === 'POST' && ruta === '/api/incidents') await esperarTurnoDeReporte();
    const inicio = Date.now();
    const r = await this.request.fetch(`${API_URL}${ruta}`, { method: metodo, headers: this.cabeceras(o.como, o.headers), data: o.body, failOnStatusCode: false });
    return this.registrar(metodo, ruta, o.como, o.body, inicio, r);
  }
  get(ruta: string, o: Opciones = {}) { return this.llamar('GET', ruta, o); }
  post(ruta: string, o: Opciones = {}) { return this.llamar('POST', ruta, o); }
  patch(ruta: string, o: Opciones = {}) { return this.llamar('PATCH', ruta, o); }

  /** Sube un archivo como evidencia (multipart, campo "file"). */
  async subir(incidenciaId: string, archivo: { nombre: string; tipo: string; datos: Buffer }, o: { como?: Como; etapa?: 'REPORT' | 'FIX' } = {}) {
    const ruta = `/api/incidents/${incidenciaId}/evidence${o.etapa ? `?stage=${o.etapa}` : ''}`;
    const inicio = Date.now();
    const r = await this.request.post(`${API_URL}${ruta}`, {
      headers: this.cabeceras(o.como),
      multipart: { file: { name: archivo.nombre, mimeType: archivo.tipo, buffer: archivo.datos } },
      failOnStatusCode: false,
    });
    return this.registrar('POST', ruta, o.como, { archivo: archivo.nombre, tipo: archivo.tipo, bytes: archivo.datos.length }, inicio, r);
  }

  /** Descarga una URL relativa de la API (por ejemplo /uploads/x.webp). */
  async descargar(ruta: string, o: Opciones = {}) {
    return this.get(ruta, o);
  }

  /** Anota en la bitácora un resultado que no viene de una petición HTTP (por ejemplo, una función del dominio). */
  nota(descripcion: string, valor: unknown) {
    this.pasos.push({ n: this.pasos.length + 1, peticion: descripcion, quien: '-', estado: 0, respuesta: valor, ms: 0 });
  }
}

export function codigoCaso(info: TestInfo) {
  return info.title.match(/CP-\d+/)?.[0] ?? 'SIN-CODIGO';
}

export const test = base.extend<{ api: ClienteApi }>({
  api: async ({ request }, use, testInfo) => {
    const api = new ClienteApi(request);
    await use(api);
    const caso = codigoCaso(testInfo);
    const evidencia = {
      caso,
      titulo: testInfo.title,
      ejecucion: process.env.EJECUCION ?? 'local',
      fecha: new Date().toISOString(),
      estado: testInfo.status === testInfo.expectedStatus ? 'Aprobado' : 'Fallido',
      error: testInfo.error?.message?.replace(/\u001b\[[0-9;]*m/g, '').split('\n').slice(0, 14).join('\n') ?? null,
      pasos: api.pasos,
    };
    const carpeta = path.resolve(__dirname, '../evidencias', process.env.EJECUCION ?? 'local');
    mkdirSync(carpeta, { recursive: true });
    writeFileSync(path.join(carpeta, `${caso}.json`), JSON.stringify(evidencia, null, 2));
    await testInfo.attach(`${caso}.json`, { body: JSON.stringify(evidencia, null, 2), contentType: 'application/json' });
  },
});
export { expect };
