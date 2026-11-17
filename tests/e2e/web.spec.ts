import { test, expect, sesion, espacio, esperarTurnoDeReporte } from '../../utils/fixtures';
import { CLAVE } from '../../utils/entorno';
import { crear, datos } from '../../utils/flujos';
import { captura, entrarComo } from '../../utils/web';
import { LoginPage } from '../../pages/LoginPage';
import { CentroDeMandoPage } from '../../pages/CentroDeMandoPage';
import { PanelPage } from '../../pages/PanelPage';
import { ReportePage } from '../../pages/ReportePage';
import usuarios from '../../datos/usuarios.json';
import reportes from '../../datos/reportes.json';

test.describe('Pruebas de la interfaz web', () => {
  test('CP-01 | Ingreso con credenciales válidas', async ({ page, api }, info) => {
    const login = new LoginPage(page);
    await login.abrir();
    const r = await login.ingresar(usuarios.supervisor, CLAVE);
    const cuerpo = await r.json();
    api.nota('POST /api/auth/login desde la web', { estado: r.status(), rol: cuerpo.user?.role, nombre: cuerpo.user?.name, token: cuerpo.token ? 'JWT recibido' : null });
    expect(r.status()).toBe(200);
    expect(cuerpo.user.role).toBe('SUPERVISOR');
    await expect(new CentroDeMandoPage(page).titulo).toBeVisible();
    await captura(page, info);
  });

  test('CP-04 | Consultar el resumen del panel', async ({ page, api }, info) => {
    await entrarComo(page, 'supervisor');
    const panel = new PanelPage(page);
    const r = await panel.abrir();
    const cuerpo = await r.json();
    api.nota('GET /api/dashboard/summary desde la web', { estado: r.status(), campos: Object.keys(cuerpo) });
    expect(r.status()).toBe(200);
    for (const campo of ['open', 'overdue', 'inProgress', 'resolvedToday', 'slaCompliance']) expect(cuerpo).toHaveProperty(campo);
    await expect(panel.titulo).toBeVisible();
    await expect(panel.seccion('Cumplimiento de SLA')).toBeVisible();
    await captura(page, info);
  });

  test('CP-05 | Ingreso con contraseña incorrecta', async ({ page, api }, info) => {
    const login = new LoginPage(page);
    await login.abrir();
    const r = await login.ingresar(usuarios.supervisor, 'clave-mala');
    const cuerpo = await r.json();
    api.nota('POST /api/auth/login desde la web', { estado: r.status(), respuesta: cuerpo });
    expect(r.status()).toBe(401);
    expect(cuerpo.error).toBe('Correo o contraseña incorrectos');
    await expect(login.aviso('Correo o contraseña incorrectos')).toBeVisible();
    await captura(page, info);
  });

  test.describe('vista de celular', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test('CP-26 | Estudiante registra un reporte desde el asistente del celular', async ({ page, api }, info) => {
      const d = reportes['CP-26'];
      await entrarComo(page, 'estudiante3');
      const reporte = new ReportePage(page);
      await reporte.abrir();
      await reporte.elegirEspacio(d.busqueda, d.espacio);
      await expect(reporte.paso('Punto exacto')).toBeVisible();
      await reporte.omitirPuntoExacto();
      await expect(reporte.paso('Qué pasa')).toBeVisible();
      await reporte.elegirTipoYRiesgo(d.categoria, d.riesgo);
      await expect(reporte.paso('Detalle')).toBeVisible();
      await reporte.describir(d.description);
      await expect(reporte.paso('Confirmar')).toBeVisible();
      await esperarTurnoDeReporte();
      const r = await reporte.enviarReporte();
      const cuerpo = await r.json();
      api.nota('POST /api/incidents desde el asistente', { estado: r.status(), code: cuerpo.code, status: cuerpo.status, espacio: cuerpo.space?.name, categoria: cuerpo.category, riesgo: cuerpo.riskLevel });
      expect(r.status()).toBe(201);
      expect(cuerpo.space.id).toBe(espacio(d.espacio).id);
      expect(cuerpo.category).toBe('FURNITURE');
      expect(cuerpo.riskLevel).toBe('LOW');
      await expect(page.getByText(cuerpo.code).first()).toBeVisible();
      await captura(page, info);
    });
  });

  test('CP-31 | BUG-08 | El token sigue sirviendo después de cerrar sesión', async ({ page, api }, info) => {
    const token = sesion('estudiante1').token;
    await entrarComo(page, 'estudiante1');
    const centro = new CentroDeMandoPage(page);
    await centro.abrir();
    await centro.cerrarSesion();
    await expect(new LoginPage(page).entrar).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('campus-auth') ?? '{}').state?.token ?? null)).toBeNull();
    await captura(page, info);
    // Quien copió el token antes de salir lo sigue usando.
    const r = await api.get('/api/auth/me', { como: { token, etiqueta: 'token de estudiante1 después de pulsar Salir' } });
    expect(r.status, 'al cerrar sesión el token debería quedar inválido').toBe(401);
  });

  test('CP-35 | Texto con HTML en la descripción se muestra como texto', async ({ page, api }, info) => {
    const inc = await crear(api, 'estudiante2', datos('CP-35'));
    const comentario = await api.post(`/api/incidents/${inc.id}/comments`, { como: 'estudiante2', body: { text: '<script>window.__xss=2</script><b>sigue igual</b>' } });
    expect(comentario.status).toBe(204);
    const dialogos: string[] = [];
    page.on('dialog', (d) => { dialogos.push(d.message()); d.dismiss(); });
    await entrarComo(page, 'supervisor');
    const centro = new CentroDeMandoPage(page);
    await centro.abrir();
    await centro.buscar(inc.code);
    await centro.incidencia(inc.code).click();
    await expect(page.getByText('<img src=x onerror="window.__xss=1">', { exact: false }).first()).toBeVisible();
    await captura(page, info);
    const xss = await page.evaluate(() => (window as any).__xss ?? null);
    api.nota('Revisión en el navegador', { ventanasEmergentes: dialogos, variableInyectada: xss });
    expect(xss).toBeNull();
    expect(dialogos).toHaveLength(0);
  });
});
