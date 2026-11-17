import { test, expect } from '../../utils/fixtures';
import { crear, datos, detalle, esperarAgrupada, hastaResuelto, hastaVerificado, transicion } from '../../utils/flujos';

test.describe('Pruebas de transición de estados', () => {
  test('CP-18 | Flujo completo Pendiente → Verificado con historial', async ({ api }) => {
    const inc = await crear(api, 'estudiante1', datos('CP-18'));
    expect((await transicion(api, inc.id, 'tecnico1', 'IN_PROGRESS')).status).toBe(200);
    expect((await transicion(api, inc.id, 'tecnico1', 'RESOLVED', { note: 'Pintado' })).status).toBe(200);
    expect((await transicion(api, inc.id, 'supervisor', 'VERIFIED')).status).toBe(200);
    const d = (await detalle(api, inc.id)).body;
    expect(d.status).toBe('VERIFIED');
    expect(d.history.map((h: any) => h.toStatus)).toEqual(['PENDING', 'IN_PROGRESS', 'RESOLVED', 'VERIFIED']);
    for (const etapa of d.history.slice(1)) expect(typeof etapa.durationInPrevMs).toBe('number');
  });

  test('CP-19 | Saltar de Pendiente a Resuelto', async ({ api }) => {
    const inc = await crear(api, 'estudiante1', datos('CP-19'));
    const r = await transicion(api, inc.id, 'tecnico1', 'RESOLVED', { note: 'Saltando etapa' });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('Esa transición no existe en el flujo');
    expect((await detalle(api, inc.id)).body.status).toBe('PENDING');
  });

  test('CP-20 | Reabrir Resuelto → En proceso', async ({ api }) => {
    const inc = await crear(api, 'estudiante1', datos('CP-20'));
    await hastaResuelto(api, inc.id);
    const antes = (await detalle(api, inc.id)).body;
    const sinNota = await transicion(api, inc.id, 'estudiante1', 'IN_PROGRESS');
    const conNota = await transicion(api, inc.id, 'estudiante1', 'IN_PROGRESS', { note: 'La mancha volvió a salir' });
    const d = (await detalle(api, inc.id)).body;
    expect(sinNota.status).toBe(400);
    expect(sinNota.body.error).toBe('Esta transición necesita una nota');
    expect(conNota.status).toBe(200);
    expect(d.status).toBe('IN_PROGRESS');
    expect(d.resolvedAt).toBeNull();
    expect(d.resolutionDueAt).not.toBe(antes.resolutionDueAt);
  });

  test('CP-51 | Un caso verificado no cambia a ningún estado', async ({ api }) => {
    const inc = await crear(api, 'estudiante2', datos('CP-51'));
    await hastaVerificado(api, inc.id);
    for (const destino of ['PENDING', 'IN_PROGRESS', 'RESOLVED', 'VERIFIED']) {
      const r = await transicion(api, inc.id, 'supervisor', destino, { note: 'Intento de cambio', assigneeId: undefined });
      expect.soft(r.status, `VERIFIED → ${destino}`).toBe(403);
      expect.soft(r.body.error).toBe('Esa transición no existe en el flujo');
    }
    expect((await detalle(api, inc.id)).body.status).toBe('VERIFIED');
  });

  test('CP-52 | Reabrir un caso que sigue Pendiente', async ({ api }) => {
    const inc = await crear(api, 'estudiante3', datos('CP-52'));
    const r = await transicion(api, inc.id, 'estudiante3', 'IN_PROGRESS', { note: 'Lo reabro' });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('Tu rol no puede ejecutar esta transición');
    expect((await detalle(api, inc.id)).body.status).toBe('PENDING');
  });

  test('CP-53 | Reabrir el mismo caso tres veces', async ({ api }) => {
    const inc = await crear(api, 'estudiante5', datos('CP-53'));
    expect((await transicion(api, inc.id, 'tecnico1', 'IN_PROGRESS')).status).toBe(200);
    const vencimientos: string[] = [];
    for (let vuelta = 1; vuelta <= 3; vuelta++) {
      expect((await transicion(api, inc.id, 'tecnico1', 'RESOLVED', { note: `Arreglo número ${vuelta}` })).status).toBe(200);
      expect((await transicion(api, inc.id, 'estudiante5', 'IN_PROGRESS', { note: `Sigue igual, vuelta ${vuelta}` })).status).toBe(200);
      vencimientos.push((await detalle(api, inc.id)).body.resolutionDueAt);
    }
    const d = (await detalle(api, inc.id)).body;
    const reaperturas = d.history.filter((h: any) => h.fromStatus === 'RESOLVED' && h.toStatus === 'IN_PROGRESS');
    expect(reaperturas).toHaveLength(3);
    expect(new Set(vencimientos).size).toBe(3);
    expect(d.status).toBe('IN_PROGRESS');
  });

  test('CP-54 | BUG-06 | Dos técnicos toman el mismo caso al mismo tiempo', async ({ api }) => {
    const inc = await crear(api, 'estudiante1', datos('CP-54'));
    const [a, b] = await Promise.all([
      transicion(api, inc.id, 'tecnico1', 'IN_PROGRESS'),
      transicion(api, inc.id, 'tecnico2', 'IN_PROGRESS'),
    ]);
    const d = (await detalle(api, inc.id)).body;
    const tomas = d.history.filter((h: any) => h.fromStatus === 'PENDING' && h.toStatus === 'IN_PROGRESS');
    api.nota('Resultado de la carrera', { tecnico1: a.status, tecnico2: b.status, asignado: d.assignee?.name, tomasEnHistorial: tomas.length });
    // Solo uno debe quedarse con el caso; el otro debe recibir un rechazo.
    expect.soft([a.status, b.status].filter((s) => s === 200), 'respuestas 200').toHaveLength(1);
    expect.soft(tomas, 'registros PENDING → IN_PROGRESS en el historial').toHaveLength(1);
  });

  test('CP-55 | Un reporte agrupado no cambia de estado por su cuenta', async ({ api }) => {
    const madre = await crear(api, 'estudiante2', datos('CP-55', 0));
    const hija = await crear(api, 'estudiante4', datos('CP-55', 1));
    await esperarAgrupada(api, hija.id);
    const r = await transicion(api, hija.id, 'tecnico1', 'IN_PROGRESS');
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/^Este reporte está agrupado: el estado se cambia en la incidencia madre INC-\d{5}$/);
    expect((await detalle(api, madre.id)).body.status).toBe('PENDING');
  });

  test('CP-56 | Cerrar la incidencia madre cierra también la hija', async ({ api }) => {
    const madre = await crear(api, 'estudiante3', datos('CP-56', 0));
    const hija = await crear(api, 'estudiante5', datos('CP-56', 1));
    await esperarAgrupada(api, hija.id);
    await hastaVerificado(api, madre.id);
    const dHija = (await detalle(api, hija.id)).body;
    expect(dHija.status).toBe('VERIFIED');
    expect(dHija.history.at(-1).reason).toBe('CLUSTER_PROPAGATION');
  });
});
