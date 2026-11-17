# auditoria-qa: pruebas automatizadas de El Campus También Se Daña

Proyecto de pruebas de la auditoría de calidad hecha por Frederick Alexandro Abril Mogollón y Santiago Abril Monroy
(UNIMINUTO, Testing y QA). Está separado de la aplicación: no modifica ni una línea de su código.

- Aplicación auditada: https://github.com/MrRoar154/Hackaton, commit `16ebe4d`.
- Herramienta: Playwright 1.63 (`request` para la API y `page` para la web, con Chromium).
- 57 casos automatizados (CP-01 a CP-57). 11 fallan a propósito: cada uno está ligado a un defecto real (BUG-01 a BUG-11).
  No se usa `test.fail()` ni `skip`: si un defecto se corrige, su caso pasa a verde.

**Guía completa paso a paso (instalar, correr, ver reportes, cobertura, GitHub Actions y problemas comunes): abre [index.html](index.html) en el navegador.**

## Estructura

```
auditoria-qa/
├── playwright.config.ts      proyectos api, e2e y limite-ingreso; reportes html + json + junit
├── global-setup.ts           recarga los datos de ejemplo e inicia sesión con cada rol
├── datos/                    usuarios.json y reportes.json (un salón y una descripción por caso)
├── pages/                    LoginPage, ReportePage, CentroDeMandoPage, PanelPage (POM)
├── utils/                    cliente de API con bitácora, sesiones por rol, imágenes, JWT, dominio
├── tests/api/                casos de API por técnica (positivas, negativas, límite, decisión, transición)
├── tests/e2e/                casos de la interfaz web
├── tests/limite/             límite de 10 ingresos por minuto (corre siempre al final)
├── cobertura/                medición de cobertura de la API con c8
└── evidencias/               un JSON por caso con cada petición y su respuesta, y capturas
```

## 1. Encender la aplicación

Requisitos: Node 22, Docker y Git.

```bash
git clone https://github.com/MrRoar154/Hackaton.git
cd Hackaton
git checkout 16ebe4d
cp .env.example .env          # en Windows: copy .env.example .env
npm install
npm run db:up                 # PostgreSQL 16 + pgvector en Docker, puerto 5434
npm run db:deploy             # migraciones
npm run db:seed               # 2 sedes, 38 espacios, 10 usuarios, 63 incidencias
npm run dev                   # API en http://localhost:4000 y web en http://127.0.0.1:5173
```

Por defecto las pruebas buscan la aplicación en `../../Hackaton` (respecto a esta carpeta). Si está en otro lugar:
`APP_DIR=/ruta/a/Hackaton`. También se pueden cambiar `API_URL` y `WEB_URL`.

## 2. Instalar las pruebas

```bash
cd auditoria-qa
npm install
npx playwright install chromium
```

## 3. Ejecutar

| Qué | Comando |
|---|---|
| Toda la suite (unos 4 minutos) | `npx playwright test` |
| Solo la API | `npx playwright test --project=api` |
| Solo la web | `npx playwright test --project=e2e` |
| Un caso | `npx playwright test -g "CP-18"` |
| Un caso que falla por defecto | `npx playwright test -g "CP-09"` |
| La web viendo el navegador | `npx playwright test --project=e2e --headed` |
| Abrir el reporte | `npx playwright show-report resultados/local/html` |

Cada ejecución recarga los datos de ejemplo (`npm run db:seed` en la aplicación), porque los SLA vencen con el reloj.
Después espera 61 segundos: la API guarda el árbol de espacios en caché 60 s y el ingreso admite 10 intentos por minuto.
Con `SIN_SEED=1` se salta la recarga.

Los reportes quedan en `resultados/<EJECUCION>/` (html, `resultados.json` y `junit.xml`) y la evidencia de cada caso en
`evidencias/<EJECUCION>/CP-XX.json`. Capturas, video y traza se guardan solo cuando un caso falla.

## 4. Cobertura de código de la API

Apaga `npm run dev` y deja solo la web (`npm run dev -w @campus/web` dentro de Hackaton). Luego:

```bash
npm run cobertura             # una ejecución
node cobertura/ejecutar-con-cobertura.mjs 3   # tres ejecuciones seguidas
```

El script arranca la API con `c8` (a través de `cobertura/servidor-api.mjs`, que solo importa `apps/api/src/main.ts`),
corre la suite, apaga la API de forma limpia y deja el reporte en `cobertura/reporte-api/index.html`.

## Notas de diseño

- Un solo worker y en orden: los casos comparten la base de datos y los límites por IP de la API
  (10 ingresos por minuto y 30 reportes por minuto). El cliente espera su turno antes de pasar de 28 reportes en un minuto.
- Los casos de la web que no prueban el ingreso cargan la sesión en el navegador (como lo hace la propia web)
  para no gastar intentos de ingreso.
- El proyecto `limite-ingreso` es el teardown de `preparacion`, así corre de último aunque haya casos fallidos.
