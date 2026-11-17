import { test, expect, espacio } from '../../utils/fixtures';
import { CLAVE } from '../../utils/entorno';
import { crear, datos, detalle, esperarAgrupada, cuerpoReporte } from '../../utils/flujos';

test.describe('Pruebas positivas', () => {
  test('CP-02 | Estudiante registra una incidencia válida', async ({ api }) => {
    const r = await api.post('/api/incidents', { como: 'estudiante1', body: cuerpoReporte(datos('CP-02')) });
    expect(r.status).toBe(201);
    expect(r.body.code).toMatch(/^INC-\d{5}$/);
    expect(r.body.status).toBe('PENDING');
    expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(r.body.priorityLevel);
  });

  test('CP-03 | Vista previa de prioridad con desglose de 5 factores', async ({ api }) => {
    const d = datos('CP-03');
    const r = await api.post('/api/incidents/preview', { como: 'estudiante1', body: cuerpoReporte(d) });
    expect(r.status).toBe(200);
    expect(Object.keys(r.body.breakdown).sort()).toEqual(['age', 'damageType', 'risk', 'similar', 'space']);
    const pesos = Object.values<any>(r.body.breakdown).reduce((s, f) => s + f.weight, 0);
    expect(pesos).toBeCloseTo(1, 5);
    expect(r.body.level).toBe('CRITICAL');
    expect(r.body.responseHours).toBe(1);
    expect(r.body.resolutionHours).toBe(4);
  });

  test('CP-21 | Ingreso con correo en mayúsculas y espacios', async ({ api }) => {
    const r = await api.post('/api/auth/login', { body: { email: '  ESTUDIANTE1@Campus.edu.co ', password: CLAVE } });
    expect(r.status).toBe(200);
    expect(r.body.user.email).toBe('estudiante1@campus.edu.co');
    expect(r.body.user.role).toBe('STUDENT');
  });

  test('CP-22 | Buscar un espacio por su código QR', async ({ api }) => {
    const lab = espacio('Laboratorio de Biología');
    const r = await api.get(`/api/locations/qr/${lab.qrToken.toUpperCase()}`, { como: 'estudiante2' });
    expect(r.status).toBe(200);
    expect(r.body.id).toBe(lab.id);
    expect(r.body.name).toBe('Laboratorio de Biología');
  });

  test('CP-23 | Supervisor corrige el riesgo y la prioridad se recalcula', async ({ api }) => {
    const inc = await crear(api, 'estudiante4', datos('CP-23'));
    expect(inc.priorityLevel).toBe('MEDIUM');
    const r = await api.patch(`/api/incidents/${inc.id}/risk`, { como: 'supervisor', body: { riskLevel: 'HIGH', note: 'La mesa puede caer sobre alguien' } });
    expect(r.status).toBe(204);
    // El riesgo pasa de 0 a 100 puntos con peso 0,35: el puntaje debe subir 35.
    await expect.poll(async () => (await detalle(api, inc.id)).body.priorityScore, { timeout: 10_000 }).toBeCloseTo(inc.priorityScore + 35, 0);
    const d = (await detalle(api, inc.id)).body;
    expect(d.riskLevel).toBe('HIGH');
    expect(d.priorityLevel).toBe('HIGH');
  });

  test('CP-24 | Dos estudiantes reportan el mismo daño y quedan agrupados', async ({ api }) => {
    const madre = await crear(api, 'estudiante2', datos('CP-24', 0));
    const hija = await crear(api, 'estudiante3', datos('CP-24', 1));
    const dHija = await esperarAgrupada(api, hija.id);
    expect(dHija.isClusterPrimary).toBe(false);
    const dMadre = (await detalle(api, madre.id)).body;
    expect(dMadre.clusterId).toBe(dHija.clusterId);
    expect(dMadre.clusterSize).toBe(2);
    // Factor de reportes similares: 25·log2(2+1) = 39,6
    await expect.poll(async () => (await detalle(api, madre.id)).body.priorityBreakdown.similar.value).toBeCloseTo(39.6, 1);
  });

  test('CP-25 | Comentario en un reporte propio queda en el detalle', async ({ api }) => {
    const inc = await crear(api, 'estudiante5', datos('CP-25'));
    const c = await api.post(`/api/incidents/${inc.id}/comments`, { como: 'estudiante5', body: { text: 'Sigue igual esta tarde, ya van dos días' } });
    expect(c.status).toBe(204);
    const d = (await detalle(api, inc.id, 'estudiante5')).body;
    expect(JSON.stringify(d.events)).toContain('Sigue igual esta tarde, ya van dos días');
  });
});
