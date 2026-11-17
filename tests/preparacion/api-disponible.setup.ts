import { test as setup, expect } from '@playwright/test';
import { API_URL } from '../../utils/entorno';

// No es un caso de prueba: confirma que la API sigue arriba después de la preparación global.
// Este proyecto existe para que el proyecto "limite-ingreso" corra al final como teardown,
// incluso cuando hay casos fallidos (los fallos esperados por defectos no deben impedirlo).
setup('preparación: la API responde', async ({ request }) => {
  const r = await request.get(`${API_URL}/api/health`);
  expect(r.status()).toBe(200);
});
