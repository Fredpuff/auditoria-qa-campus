import { test, expect } from '../../utils/fixtures';
import { crear, datos, cuerpoReporte } from '../../utils/flujos';
import { png, CINCO_MB } from '../../utils/imagenes';
import { dominio } from '../../utils/dominio';

function textoDe(largo: number) {
  const frase = (datos('CP-36') as any).frase as string;
  let t = frase.repeat(Math.ceil(largo / frase.length) + 1).slice(0, largo);
  t = t.slice(0, -1) + '.';
  return t;
}

test.describe('Pruebas de valores límite', () => {
  test('CP-10 | Descripción de 7 caracteres (mínimo − 1)', async ({ api }) => {
    const r = await api.post('/api/incidents', { como: 'estudiante2', body: cuerpoReporte(datos('CP-10')) });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('Describe el daño con al menos 8 caracteres');
  });

  test('CP-11 | Descripción de 8 caracteres (mínimo)', async ({ api }) => {
    const r = await api.post('/api/incidents', { como: 'estudiante2', body: cuerpoReporte(datos('CP-11')) });
    expect(r.status).toBe(201);
    expect(r.body.description).toHaveLength(8);
  });

  test('CP-12 | Umbrales de nivel de prioridad 25 / 50 / 75', async ({ api }) => {
    const { levelFromScore } = await dominio();
    const valores: [number, string][] = [[0, 'LOW'], [24.9, 'LOW'], [25, 'MEDIUM'], [49.9, 'MEDIUM'], [50, 'HIGH'], [74.9, 'HIGH'], [75, 'CRITICAL']];
    const obtenido = Object.fromEntries(valores.map(([v]) => [v, levelFromScore(v)]));
    api.nota('levelFromScore (packages/shared/src/domain/priority.ts)', obtenido);
    for (const [v, nivel] of valores) expect.soft(levelFromScore(v), `puntaje ${v}`).toBe(nivel);
  });

  test('CP-13 | Foto de 5 MB + 1 byte', async ({ api }) => {
    const inc = await crear(api, 'estudiante1', datos('CP-13'));
    const r = await api.subir(inc.id, { nombre: 'pesada.png', tipo: 'image/png', datos: png(CINCO_MB + 1) }, { como: 'estudiante1' });
    expect(r.status).toBe(413);
    expect(r.body.error).toBe('La imagen supera el tamaño máximo de 5 MB');
  });

  test('CP-36 | Descripción de 1000 caracteres (máximo)', async ({ api }) => {
    const d = { ...datos('CP-36'), description: textoDe(1000) };
    const r = await api.post('/api/incidents', { como: 'estudiante3', body: cuerpoReporte(d) });
    expect(r.status).toBe(201);
    expect(r.body.description).toHaveLength(1000);
  });

  test('CP-37 | BUG-09 | Descripción de 1001 caracteres responde un mensaje en inglés', async ({ api }) => {
    const d = { ...datos('CP-36'), description: textoDe(1001) };
    const r = await api.post('/api/incidents', { como: 'estudiante3', body: cuerpoReporte(d) });
    expect(r.status).toBe(400);
    expect(r.body.field).toBe('description');
    // Los demás mensajes de la aplicación están en español ("Describe el daño con al menos 8 caracteres").
    expect(r.body.error, 'el mensaje que ve el usuario debe estar en español').toMatch(/caracteres/);
  });

  test('CP-38 | Foto de exactamente 5 MB', async ({ api }) => {
    const inc = await crear(api, 'estudiante4', datos('CP-38'));
    const archivo = png(CINCO_MB);
    expect(archivo.length).toBe(5_242_880);
    const r = await api.subir(inc.id, { nombre: 'justa.png', tipo: 'image/png', datos: archivo }, { como: 'estudiante4' });
    expect(r.status).toBe(201);
    expect(r.body.url).toMatch(/\.webp$/);
  });

  test('CP-39 | Punto exacto (hotspot) en los bordes del salón', async ({ api }) => {
    const enBorde1 = await api.post('/api/incidents', { como: 'estudiante5', body: cuerpoReporte(datos('CP-39', 0)) });
    const enBorde2 = await api.post('/api/incidents', { como: 'estudiante5', body: cuerpoReporte(datos('CP-39', 1)) });
    const fueraX = await api.post('/api/incidents', { como: 'estudiante5', body: cuerpoReporte(datos('CP-39', 2)) });
    const fueraY = await api.post('/api/incidents', { como: 'estudiante5', body: cuerpoReporte(datos('CP-39', 3)) });
    expect(enBorde1.status).toBe(201);
    expect(enBorde1.body.hotspot).toEqual({ x: 50, y: 20, z: -50 });
    expect(enBorde2.status).toBe(201);
    expect(fueraX.status).toBe(400);
    expect(fueraX.body.field).toBe('hotspot.x');
    expect(fueraY.status).toBe(400);
    expect(fueraY.body.field).toBe('hotspot.y');
  });

  test('CP-40 | Parámetro limit en 0, 1, 500 y 501', async ({ api }) => {
    const r0 = await api.get('/api/incidents?limit=0', { como: 'supervisor' });
    const r1 = await api.get('/api/incidents?limit=1', { como: 'supervisor' });
    const r500 = await api.get('/api/incidents?limit=500', { como: 'supervisor' });
    const r501 = await api.get('/api/incidents?limit=501', { como: 'supervisor' });
    const rNeg = await api.get('/api/incidents?limit=-1', { como: 'supervisor' });
    expect(r0.status).toBe(400);
    expect(r1.status).toBe(200);
    expect(r1.body).toHaveLength(1);
    expect(r500.status).toBe(200);
    expect(r501.status).toBe(400);
    expect(rNeg.status).toBe(400);
  });

  test('CP-41 | Aviso de SLA al 80 % y vencimiento al 100 %', async ({ api }) => {
    const { slaState } = await dominio();
    const inicio = new Date('2026-11-10T08:00:00Z');
    const vence = new Date('2026-11-10T18:00:00Z'); // 10 horas de ventana
    const en = (fraccion: number) => new Date(inicio.getTime() + fraccion * 10 * 3_600_000);
    const casos: [number, string][] = [[0.79, 'ok'], [0.8, 'warning'], [0.99, 'warning'], [1, 'breach'], [1.2, 'breach']];
    const obtenido = Object.fromEntries(casos.map(([f]) => [`${f * 100}%`, slaState(en(f), inicio, vence, 'IN_PROGRESS')]));
    obtenido['100% con estado RESOLVED'] = slaState(en(1), inicio, vence, 'RESOLVED');
    api.nota('slaState (packages/shared/src/domain/sla.ts)', obtenido);
    for (const [f, estado] of casos) expect.soft(slaState(en(f), inicio, vence, 'IN_PROGRESS'), `${f * 100} %`).toBe(estado);
    expect(slaState(en(1), inicio, vence, 'RESOLVED')).toBe('done');
  });

  test('CP-42 | Factor de reportes similares con 1, 2, 14 y 15 reportes', async ({ api }) => {
    const { similarReportsValue } = await dominio();
    const obtenido = Object.fromEntries([1, 2, 14, 15, 30].map((n) => [n, Math.round(similarReportsValue(n) * 10) / 10]));
    api.nota('similarReportsValue (packages/shared/src/domain/priority.ts)', obtenido);
    expect(obtenido[1]).toBe(25);
    expect(obtenido[2]).toBe(39.6);
    expect(obtenido[14]).toBeLessThan(100);
    expect(obtenido[15]).toBe(100);
    expect(obtenido[30]).toBe(100);
  });
});
