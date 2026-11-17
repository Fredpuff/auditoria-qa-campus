import { test, expect } from '../../utils/fixtures';
import usuarios from '../../datos/usuarios.json';

// Estos casos van al final (proyecto "limite-ingreso", que depende de los demás):
// bloquean el ingreso desde esta máquina durante un minuto.
test.describe('Límite de 10 ingresos por minuto', () => {
  test.beforeAll(async () => {
    // Se espera a que se cierre la ventana de un minuto de los ingresos hechos por los otros casos.
    await new Promise((r) => setTimeout(r, 61_000));
  });

  test('CP-43 | Límite de 10 intentos de ingreso por minuto (10 pasan, el 11 se bloquea)', async ({ api }) => {
    const estados: number[] = [];
    let ultimo: any = null;
    for (let i = 1; i <= 11; i++) {
      const r = await api.post('/api/auth/login', { body: { email: usuarios.supervisor, password: `clave-mala-${i}` } });
      estados.push(r.status);
      ultimo = r.body;
    }
    api.nota('Estados de los 11 intentos', estados);
    expect(estados.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(estados[10]).toBe(429);
    expect(ultimo.error).toBe('Demasiadas solicitudes, intenta en un momento');
  });

  test('CP-57 | BUG-07 | El límite de ingresos se evita cambiando la cabecera X-Forwarded-For', async ({ api }) => {
    const estados: number[] = [];
    for (let i = 1; i <= 12; i++) {
      // El mismo cliente, en el mismo minuto, solo cambia la IP que dice tener.
      const r = await api.post('/api/auth/login', {
        body: { email: usuarios.supervisor, password: `adivinanza-${i}` },
        headers: { 'x-forwarded-for': `203.0.113.${i}` },
      });
      estados.push(r.status);
    }
    api.nota('Estados de los 12 intentos con IP falsa', estados);
    expect(estados.filter((s) => s === 429).length, 'el intento 11 en adelante debería bloquearse').toBeGreaterThanOrEqual(2);
  });
});
