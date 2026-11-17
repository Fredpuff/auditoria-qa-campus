import { test, expect } from '../../utils/fixtures';
import { crear, datos, detalle, esperarAgrupada, fotoPng, hastaResuelto, hastaVerificado, idDe, transicion } from '../../utils/flujos';

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

test.describe('Pruebas basadas en tablas de decisión', () => {
  test('CP-14 | Supervisor asigna un caso', async ({ api }) => {
    const inc = await crear(api, 'estudiante1', datos('CP-14'));
    const sinTecnico = await transicion(api, inc.id, 'supervisor', 'IN_PROGRESS');
    const aEstudiante = await transicion(api, inc.id, 'supervisor', 'IN_PROGRESS', { assigneeId: idDe('estudiante2') });
    const aTecnico = await transicion(api, inc.id, 'supervisor', 'IN_PROGRESS', { assigneeId: idDe('tecnico2') });
    expect(sinTecnico.status).toBe(400);
    expect(sinTecnico.body.error).toBe('Elige el técnico al que asignas el caso');
    expect(aEstudiante.status).toBe(400);
    expect(aEstudiante.body.error).toBe('El usuario elegido no es técnico');
    expect(aTecnico.status).toBe(200);
    expect((await detalle(api, inc.id)).body.assignee.name).toBe('Andrea Pineda');
  });

  // Tabla de decisión: quién puede marcar Resuelto y con qué evidencia (parametrizada).
  const reglasResolver = [
    { regla: 'R1', quien: 'tecnico1', cuerpo: {}, esperado: 400, mensaje: 'Adjunta una foto o una nota del arreglo', condicion: 'técnico asignado sin foto ni nota' },
    { regla: 'R2', quien: 'tecnico2', cuerpo: { note: 'Se pintó la pared' }, esperado: 403, mensaje: 'Solo el técnico asignado puede resolverlo', condicion: 'técnico no asignado' },
    { regla: 'R3', quien: 'estudiante1', cuerpo: { note: 'Se pintó la pared' }, esperado: 403, mensaje: 'Tu rol no puede ejecutar esta transición', condicion: 'estudiante' },
    { regla: 'R4', quien: 'tecnico1', cuerpo: { note: 'Se pintó la pared' }, esperado: 200, mensaje: null, condicion: 'técnico asignado con nota' },
  ] as const;

  test('CP-15 | Quién puede marcar Resuelto y con qué evidencia', async ({ api }) => {
    const inc = await crear(api, 'estudiante1', datos('CP-15'));
    expect((await transicion(api, inc.id, 'tecnico1', 'IN_PROGRESS')).status).toBe(200);
    for (const r of reglasResolver) {
      await test.step(`${r.regla}: ${r.condicion} → ${r.esperado}`, async () => {
        const res = await transicion(api, inc.id, r.quien, 'RESOLVED', r.cuerpo);
        expect(res.status).toBe(r.esperado);
        if (r.mensaje) expect(res.body.error).toBe(r.mensaje);
      });
    }
    expect((await detalle(api, inc.id)).body.status).toBe('RESOLVED');
  });

  test('CP-16 | Técnico intenta resolver su propio reporte', async ({ api }) => {
    const inc = await crear(api, 'tecnico1', datos('CP-16'));
    expect((await transicion(api, inc.id, 'tecnico1', 'IN_PROGRESS')).status).toBe(200);
    const r = await transicion(api, inc.id, 'tecnico1', 'RESOLVED', { note: 'Arreglado' });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('Nadie puede resolver un reporte propio');
  });

  test('CP-17 | Quién puede verificar un arreglo', async ({ api }) => {
    const inc = await crear(api, 'estudiante1', datos('CP-17'));
    await hastaResuelto(api, inc.id);
    const otro = await transicion(api, inc.id, 'estudiante2', 'VERIFIED');
    const tecnico = await transicion(api, inc.id, 'tecnico1', 'VERIFIED');
    const dueno = await transicion(api, inc.id, 'estudiante1', 'VERIFIED');
    expect(otro.status).toBe(403);
    expect(otro.body.error).toBe('Un estudiante solo puede actuar sobre sus propios reportes');
    expect(tecnico.status).toBe(403);
    expect(tecnico.body.error).toBe('Tu rol no puede ejecutar esta transición');
    expect(dueno.status).toBe(200);
  });

  test('CP-44 | Quién puede corregir el riesgo de un reporte', async ({ api }) => {
    const inc = await crear(api, 'estudiante1', datos('CP-44'));
    const tecnico = await api.patch(`/api/incidents/${inc.id}/risk`, { como: 'tecnico1', body: { riskLevel: 'LOW' } });
    const estudiante = await api.patch(`/api/incidents/${inc.id}/risk`, { como: 'estudiante1', body: { riskLevel: 'LOW' } });
    const supervisor = await api.patch(`/api/incidents/${inc.id}/risk`, { como: 'supervisor', body: { riskLevel: 'LOW', note: 'Alguien puede resbalar' } });
    expect(tecnico.status).toBe(403);
    expect(estudiante.status).toBe(403);
    expect(supervisor.status).toBe(204);
  });

  test('CP-45 | Consultas reservadas al personal según el rol', async ({ api }) => {
    const filas = [
      { rol: 'supervisor', esperado: 200 },
      { rol: 'tecnico1', esperado: 200 },
      { rol: 'estudiante1', esperado: 403 },
    ] as const;
    for (const f of filas) {
      const sugerencias = await api.get('/api/similarity/suggestions', { como: f.rol });
      const tecnicos = await api.get('/api/auth/technicians', { como: f.rol });
      expect.soft(sugerencias.status, `${f.rol} /suggestions`).toBe(f.esperado);
      expect.soft(tecnicos.status, `${f.rol} /technicians`).toBe(f.esperado);
    }
  });

  test('CP-46 | Quién adjunta evidencia del daño y del arreglo', async ({ api }) => {
    const inc = await crear(api, 'estudiante1', datos('CP-46'));
    const repDueno = await api.subir(inc.id, fotoPng(), { como: 'estudiante1', etapa: 'REPORT' });
    const repOtro = await api.subir(inc.id, fotoPng(), { como: 'estudiante2', etapa: 'REPORT' });
    const repSup = await api.subir(inc.id, fotoPng(), { como: 'supervisor', etapa: 'REPORT' });
    expect((await transicion(api, inc.id, 'tecnico1', 'IN_PROGRESS')).status).toBe(200);
    const fixAsignado = await api.subir(inc.id, fotoPng(), { como: 'tecnico1', etapa: 'FIX' });
    const fixOtroTec = await api.subir(inc.id, fotoPng(), { como: 'tecnico2', etapa: 'FIX' });
    const fixEstudiante = await api.subir(inc.id, fotoPng(), { como: 'estudiante1', etapa: 'FIX' });
    expect(repDueno.status).toBe(201);
    expect(repOtro.status).toBe(403);
    expect(repOtro.body.error).toBe('Solo quien reporta puede adjuntar evidencia del daño');
    expect(repSup.status).toBe(201);
    expect(fixAsignado.status).toBe(201);
    expect(fixOtroTec.status).toBe(403);
    expect(fixEstudiante.status).toBe(403);
    expect(fixEstudiante.body.error).toBe('Solo el técnico asignado adjunta evidencia del arreglo');
  });

  test('CP-47 | Quién puede reabrir un arreglo y con qué datos', async ({ api }) => {
    const inc = await crear(api, 'estudiante2', datos('CP-47'));
    await hastaResuelto(api, inc.id);
    const otroEst = await transicion(api, inc.id, 'estudiante3', 'IN_PROGRESS', { note: 'No quedó bien' });
    const tecnico = await transicion(api, inc.id, 'tecnico2', 'IN_PROGRESS', { note: 'No quedó bien' });
    const supSinNota = await transicion(api, inc.id, 'supervisor', 'IN_PROGRESS');
    const dueno = await transicion(api, inc.id, 'estudiante2', 'IN_PROGRESS', { note: 'La pintura se volvió a caer' });
    expect(otroEst.status).toBe(403);
    expect(tecnico.status).toBe(403);
    expect(supSinNota.status).toBe(400);
    expect(supSinNota.body.error).toBe('Esta transición necesita una nota');
    expect(dueno.status).toBe(200);
  });

  test('CP-48 | BUG-10 | Se puede cambiar el riesgo de un caso ya verificado', async ({ api }) => {
    const abierto = await crear(api, 'estudiante3', datos('CP-48', 0));
    const cerrado = await crear(api, 'estudiante3', datos('CP-48', 1));
    await hastaVerificado(api, cerrado.id);
    const enAbierto = await api.patch(`/api/incidents/${abierto.id}/risk`, { como: 'supervisor', body: { riskLevel: 'MEDIUM' } });
    const enCerrado = await api.patch(`/api/incidents/${cerrado.id}/risk`, { como: 'supervisor', body: { riskLevel: 'HIGH' } });
    expect(enAbierto.status).toBe(204);
    expect(enCerrado.status, 'un caso verificado es el estado final y no debería modificarse').toBeGreaterThanOrEqual(400);
    expect((await detalle(api, cerrado.id)).body.riskLevel).toBe('NONE');
  });

  test('CP-49 | BUG-11 | Se pueden subir fotos a un caso ya verificado', async ({ api }) => {
    const inc = await crear(api, 'estudiante4', datos('CP-49'));
    await hastaVerificado(api, inc.id);
    const r = await api.subir(inc.id, fotoPng(), { como: 'estudiante4', etapa: 'REPORT' });
    expect(r.status, 'un caso verificado es el estado final y no debería recibir evidencia').toBeGreaterThanOrEqual(400);
  });

  test('CP-50 | Cuándo se agrupan dos reportes', async ({ api }) => {
    const base = await crear(api, 'estudiante5', datos('CP-50', 0));
    const mismoDano = await crear(api, 'estudiante1', datos('CP-50', 1));
    const otraCategoria = await crear(api, 'estudiante2', datos('CP-50', 2));
    const otraSede = await crear(api, 'estudiante3', datos('CP-50', 3));
    const agrupada = await esperarAgrupada(api, mismoDano.id);
    await pausa(4000);
    const dBase = (await detalle(api, base.id)).body;
    const dOtraCat = (await detalle(api, otraCategoria.id)).body;
    const dOtraSede = (await detalle(api, otraSede.id)).body;
    // R1: mismo salón, misma categoría y texto parecido → se agrupa.
    expect(agrupada.clusterId).toBe(dBase.clusterId);
    // R2: mismo salón con otra categoría y otro texto → no se agrupa.
    expect(dOtraCat.clusterId).not.toBe(dBase.clusterId);
    // R3: el mismo texto en otra sede → no se agrupa.
    expect(dOtraSede.clusterId).not.toBe(dBase.clusterId);
  });
});
