import { test, expect, sesion } from '../../utils/fixtures';
import { crear, datos, cuerpoReporte, fotoPng } from '../../utils/flujos';
import { alterar, firmar, leer, SECRETO_DE_EJEMPLO } from '../../utils/jwt';

test.describe('Pruebas negativas', () => {
  test('CP-06 | Consultar incidencias sin token', async ({ api }) => {
    const r = await api.get('/api/incidents');
    expect(r.status).toBe(401);
    expect(r.body.error).toBe('Tu sesión expiró, vuelve a iniciar sesión');
  });

  test('CP-07 | BUG-01 | La foto de evidencia se descarga sin sesión', async ({ api }) => {
    const inc = await crear(api, 'estudiante1', datos('CP-07'));
    const subida = await api.subir(inc.id, fotoPng(), { como: 'estudiante1' });
    expect(subida.status).toBe(201);
    expect(subida.body.url).toMatch(/^\/uploads\/.+\.webp$/);
    // Sin cabecera Authorization: la foto no debería entregarse.
    const sinSesion = await api.descargar(subida.body.url);
    expect(sinSesion.status, 'la foto de un reporte solo debe verla un usuario autenticado').toBe(401);
  });

  test('CP-08 | BUG-03 | Un filtro de estado inexistente se ignora', async ({ api }) => {
    const todas = await api.get('/api/incidents', { como: 'supervisor' });
    const foo = await api.get('/api/incidents?status=FOO', { como: 'supervisor' });
    const nivel = await api.get('/api/incidents?level=FOO', { como: 'supervisor' });
    expect(todas.status).toBe(200);
    // Se espera 400, o al menos una lista vacía; nunca la lista completa como si no hubiera filtro.
    for (const r of [foo, nivel]) {
      if (r.status !== 400) expect.soft(r.body.length, `devolvió ${r.body.length} de ${todas.body.length} incidencias`).toBe(0);
    }
  });

  test('CP-09 | BUG-02 | overdue=false devuelve solo vencidas', async ({ api }) => {
    const todas = await api.get('/api/incidents', { como: 'supervisor' });
    const noVencidas = await api.get('/api/incidents?overdue=false', { como: 'supervisor' });
    const misTodas = await api.get('/api/incidents', { como: 'estudiante1' });
    const mineFalse = await api.get('/api/incidents?mine=false', { como: 'estudiante1' });
    const tecTodas = await api.get('/api/incidents', { como: 'tecnico1' });
    const asignFalse = await api.get('/api/incidents?assignedToMe=false', { como: 'tecnico1' });
    // "false" no debe filtrar: cada consulta debe traer lo mismo que sin el parámetro.
    expect.soft(noVencidas.body.length, 'overdue=false').toBe(todas.body.length);
    expect.soft(mineFalse.body.length, 'mine=false').toBe(misTodas.body.length);
    expect.soft(asignFalse.body.length, 'assignedToMe=false').toBe(tecTodas.body.length);
  });

  test('CP-27 | Token con el rol alterado sin volver a firmar', async ({ api }) => {
    const falso = alterar(sesion('estudiante1').token, { role: 'SUPERVISOR' });
    const r = await api.get('/api/similarity/suggestions', { como: { token: falso, etiqueta: 'token de estudiante1 con role=SUPERVISOR' } });
    expect(r.status).toBe(401);
  });

  test('CP-28 | Token firmado con otra clave', async ({ api }) => {
    const datosToken = leer(sesion('estudiante1').token);
    const falso = firmar({ ...datosToken, role: 'SUPERVISOR' }, 'una-clave-cualquiera-que-no-es-la-del-servidor');
    const r = await api.get('/api/similarity/suggestions', { como: { token: falso, etiqueta: 'token firmado con otra clave' } });
    expect(r.status).toBe(401);
  });

  test('CP-29 | Token vencido', async ({ api }) => {
    const ahora = Math.floor(Date.now() / 1000);
    const vencido = firmar({ ...leer(sesion('estudiante1').token), iat: ahora - 9 * 3600, exp: ahora - 3600 }, SECRETO_DE_EJEMPLO);
    const r = await api.get('/api/incidents', { como: { token: vencido, etiqueta: 'token vencido hace 1 hora' } });
    expect(r.status).toBe(401);
  });

  test('CP-30 | BUG-05 | Un token firmado con el secreto de .env.example es aceptado', async ({ api }) => {
    const ahora = Math.floor(Date.now() / 1000);
    const falso = firmar({ sub: sesion('estudiante1').user.id, role: 'SUPERVISOR', name: 'Valentina Ruiz', iat: ahora, exp: ahora + 600 }, SECRETO_DE_EJEMPLO);
    // Con ese token un estudiante actúa como supervisor (la ruta solo admite SUPERVISOR o TECHNICIAN).
    const r = await api.get('/api/similarity/suggestions', { como: { token: falso, etiqueta: 'token fabricado con el secreto publicado' } });
    expect(r.status, 'el servidor no debería aceptar el secreto publicado en el repositorio').toBe(401);
  });

  test('CP-32 | BUG-04 | Acceso rápido sin contraseña habilitado en la configuración de ejemplo', async ({ api }) => {
    const lista = await api.get('/api/auth/dev-users');
    const acceso = await api.post('/api/auth/dev-login', { body: { role: 'SUPERVISOR' } });
    expect.soft(lista.body.users?.length ?? 0, 'sin sesión no debería listar usuarios con su correo').toBe(0);
    expect.soft(acceso.status, 'sin contraseña no debería entregar un token de supervisor').toBe(403);
  });

  test('CP-33 | Espacio, categoría y código QR que no existen', async ({ api }) => {
    const base = cuerpoReporte(datos('CP-11'));
    const sinEspacio = await api.post('/api/incidents', { como: 'estudiante2', body: { ...base, spaceId: '00000000-0000-4000-8000-000000000000', description: 'Ventana rota en un salón que no existe' } });
    const sinCategoria = await api.post('/api/incidents', { como: 'estudiante2', body: { ...base, category: 'NUCLEAR', description: 'Categoría que no existe en la lista' } });
    const qr = await api.get('/api/locations/qr/no-existe-123', { como: 'estudiante2' });
    expect(sinEspacio.status).toBe(404);
    expect(sinEspacio.body.error).toBe('El espacio no existe');
    expect(sinCategoria.status).toBe(400);
    expect(sinCategoria.body.field).toBe('category');
    expect(qr.status).toBe(404);
    expect(qr.body.error).toBe('Ese código QR no corresponde a ningún espacio');
  });

  test('CP-34 | Archivos que no son imagen y nombre con ../', async ({ api }) => {
    const inc = await crear(api, 'estudiante1', datos('CP-34'));
    const texto = await api.subir(inc.id, { nombre: 'falsa.png', tipo: 'image/png', datos: Buffer.from('esto es texto plano y no una imagen') }, { como: 'estudiante1' });
    const svg = await api.subir(inc.id, { nombre: 'dibujo.svg', tipo: 'image/svg+xml', datos: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') }, { como: 'estudiante1' });
    const gif = await api.subir(inc.id, { nombre: 'anim.gif', tipo: 'image/gif', datos: Buffer.from('GIF89a') }, { como: 'estudiante1' });
    const ruta = await api.subir(inc.id, { ...fotoPng(), nombre: '../../../etc/evil.png' }, { como: 'estudiante1' });
    expect(texto.status).toBe(400);
    expect(texto.body.error).toBe('El archivo no es una imagen válida');
    expect(svg.status).toBe(400);
    expect(svg.body.error).toBe('Formato no permitido: usa JPG, PNG o WebP');
    expect(gif.status).toBe(400);
    // El nombre que manda el usuario no se usa: el servidor genera uno propio.
    expect(ruta.status).toBe(201);
    expect(ruta.body.url).toMatch(/^\/uploads\/[0-9a-f-]{36}\.webp$/);
  });
});
