import reportes from '../datos/reportes.json';
import { expect, espacio, sesion, type ClienteApi, type Como, type Rol } from './fixtures';
import { png } from './imagenes';

export interface DatosReporte {
  espacio: string;
  category: string;
  riskLevel: string;
  description: string;
  hotspot?: { x: number; y: number; z: number } | null;
}

/** Datos del archivo datos/reportes.json para un caso (o una de sus variantes). */
export function datos(caso: string, i?: number): DatosReporte {
  const d = (reportes as Record<string, any>)[caso];
  return Array.isArray(d) ? d[i ?? 0] : d;
}

export function cuerpoReporte(d: DatosReporte) {
  return { spaceId: espacio(d.espacio).id, category: d.category, riskLevel: d.riskLevel, description: d.description, hotspot: d.hotspot ?? null };
}

/** Crea una incidencia y exige 201. */
export async function crear(api: ClienteApi, como: Rol, d: DatosReporte) {
  const r = await api.post('/api/incidents', { como, body: cuerpoReporte(d) });
  expect(r.status, `crear incidencia: ${JSON.stringify(r.body)}`).toBe(201);
  return r.body as { id: string; code: string; status: string; priorityScore: number; priorityLevel: string; clusterId: string | null; isClusterPrimary: boolean };
}

export const detalle = (api: ClienteApi, id: string, como: Como = 'supervisor') => api.get(`/api/incidents/${id}`, { como });

export function transicion(api: ClienteApi, id: string, como: Como, to: string, extra: Record<string, unknown> = {}) {
  return api.post(`/api/incidents/${id}/transition`, { como, body: { to, ...extra } });
}

/** Lleva la incidencia hasta RESOLVED con tecnico1 (toma el caso y lo resuelve con nota). */
export async function hastaResuelto(api: ClienteApi, id: string, nota = 'Se cambió la pieza dañada') {
  expect((await transicion(api, id, 'tecnico1', 'IN_PROGRESS')).status).toBe(200);
  expect((await transicion(api, id, 'tecnico1', 'RESOLVED', { note: nota })).status).toBe(200);
}

/** Lleva la incidencia hasta VERIFIED (el supervisor verifica). */
export async function hastaVerificado(api: ClienteApi, id: string) {
  await hastaResuelto(api, id);
  expect((await transicion(api, id, 'supervisor', 'VERIFIED')).status).toBe(200);
}

/** Espera a que la agrupación automática (asíncrona) termine y devuelve el detalle. */
export async function esperarAgrupada(api: ClienteApi, id: string) {
  let ultimo: any = null;
  await expect
    .poll(async () => {
      ultimo = (await detalle(api, id)).body;
      return ultimo.clusterId;
    }, { timeout: 15_000, intervals: [500, 1000, 2000] })
    .not.toBeNull();
  return ultimo;
}

export const fotoPng = () => ({ nombre: 'foto-dano.png', tipo: 'image/png', datos: png() });
export const idDe = (rol: Rol) => sesion(rol).user.id;
