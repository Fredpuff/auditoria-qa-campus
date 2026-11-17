# Guía para correr todo, paso a paso

Esta guía lleva desde un computador limpio hasta tener la suite corriendo, los reportes abiertos y la cobertura medida.
Los comandos están escritos para **PowerShell en Windows**; al final de cada bloque se indica la diferencia en Linux o macOS
cuando la hay.

Tiempo total la primera vez: unos 20 minutos (la mayor parte es `npm install`).

---

## 0. Requisitos

| Programa | Versión usada | Cómo comprobarlo |
|---|---|---|
| Node.js | 22.18.0 | `node -v` |
| Git | cualquiera reciente | `git --version` |
| Docker Desktop | 4.x (encendido) | `docker ps` no debe dar error |

Docker Desktop tiene que estar **abierto** antes de empezar. Si `docker ps` dice que no encuentra el demonio, abre Docker
Desktop y espera a que diga "Engine running".

---

## 1. Organizar las carpetas

Las pruebas buscan la aplicación en `..\..\Hackaton` respecto a la carpeta de pruebas. La forma más simple es dejar
esta estructura:

```
playwright\
├── Hackaton\                 (la aplicación auditada)
└── auditoria\
    └── auditoria-qa\         (este proyecto)
```

```powershell
mkdir playwright; cd playwright
git clone https://github.com/MrRoar154/Hackaton.git
mkdir auditoria; cd auditoria
git clone https://github.com/Fredpuff/auditoria-qa-campus.git auditoria-qa
cd ..
```

Si prefieres otra ubicación, antes de correr las pruebas indica dónde está la aplicación:

```powershell
$env:APP_DIR = "C:\ruta\a\Hackaton"        # Linux/macOS: export APP_DIR=/ruta/a/Hackaton
```

---

## 2. Encender la aplicación (en el commit auditado)

```powershell
cd Hackaton
git checkout 16ebe4d
copy .env.example .env        # Linux/macOS: cp .env.example .env
npm install
npm run db:up                 # PostgreSQL 16 + pgvector en Docker (puerto 5434)
npm run db:deploy             # crea las tablas
npm run db:seed               # 2 sedes, 38 espacios, 10 usuarios, 63 incidencias
npm run dev                   # API en http://localhost:4000 y web en http://127.0.0.1:5173
```

Deja **esta terminal abierta** con `npm run dev` corriendo. Para comprobar que todo está arriba, en otra terminal:

```powershell
curl.exe http://localhost:4000/api/health   # debe responder {"status":"ok",...}
```

y abre http://127.0.0.1:5173 en el navegador. Todos los usuarios de prueba usan la contraseña `campus123`
(por ejemplo `supervisor@campus.edu.co`).

> El `.env` se copia tal cual de `.env.example` porque así lo indica el README de la aplicación. Esa misma configuración
> es la que deja ver los defectos BUG-04 (acceso rápido) y BUG-05 (secreto JWT de ejemplo).

---

## 3. Instalar las pruebas

En una **segunda terminal**:

```powershell
cd playwright\auditoria\auditoria-qa
npm install
npx playwright install chromium
```

---

## 4. Correr la suite completa

```powershell
npx playwright test
```

Qué hace, en orden:

1. **Recarga los datos de ejemplo** (`npm run db:seed` dentro de Hackaton). Se hace siempre porque los SLA vencen con el reloj.
2. Inicia sesión con 8 usuarios y **espera 61 segundos**: la API guarda los espacios en caché 60 s y el ingreso admite
   10 intentos por minuto. Es normal que la consola se quede quieta ese minuto.
3. Corre los casos de API (`tests/api`) y de la web (`tests/e2e`), uno por uno.
4. Al final espera otro minuto y corre los 2 casos del bloqueo de ingresos (`tests/limite`), que dejan el ingreso
   bloqueado un minuto.

Duración: unos 4 minutos.

**Resultado esperado:**

```
  11 failed
  47 passed
```

Los 47 que pasan son los 46 casos aprobados más la preparación. Los 11 que fallan **son los defectos de la aplicación**,
cada uno con su código en el título:

| Caso | Defecto | Caso | Defecto |
|---|---|---|---|
| CP-07 | BUG-01 Fotos sin sesión | CP-37 | BUG-09 Mensajes en inglés |
| CP-08 | BUG-03 Filtro inválido ignorado | CP-48 | BUG-10 Riesgo editable en caso verificado |
| CP-09 | BUG-02 Filtros "false" al revés | CP-49 | BUG-11 Fotos en caso verificado |
| CP-30 | BUG-05 Secreto JWT de ejemplo | CP-54 | BUG-06 Dos técnicos toman el mismo caso |
| CP-31 | BUG-08 La sesión no se cierra en el servidor | CP-57 | BUG-07 Bloqueo evitable con X-Forwarded-For |
| CP-32 | BUG-04 Acceso rápido sin contraseña | | |

Si te salen **otros** casos en rojo, revisa la sección 9 (problemas comunes).

---

## 5. Correr por partes

| Qué | Comando |
|---|---|
| Solo la API | `npm run test:api` |
| Solo la web | `npm run test:e2e` |
| La web viendo el navegador | `npm run test:headed` |
| Un caso | `npx playwright test -g "CP-18"` |
| Varios casos | `npx playwright test -g "CP-18\|CP-07\|CP-09"` |
| Demo de la sustentación (CP-18 pasa, CP-07 y CP-09 fallan) | `npm run test:demo` |
| Sin recargar datos (más rápido para repetir) | `$env:SIN_SEED="1"; npx playwright test -g "CP-18"` |

Notas:

- Aunque elijas un solo proyecto, siempre corre primero la preparación (seed + espera de 61 s).
- Si corres `--project=api` o `--project=e2e` completos, al final también corren los 2 casos del bloqueo de ingresos.
- Para volver a dejar la recarga normal: `Remove-Item Env:SIN_SEED` (Linux/macOS: `unset SIN_SEED`).

---

## 6. Ver los resultados

```powershell
npm run report                 # abre el reporte HTML de la última ejecución local
```

Cada ejecución deja:

| Dónde | Qué hay |
|---|---|
| `resultados\local\html\` | Reporte HTML de Playwright (en cada caso fallido: error, captura, video y traza) |
| `resultados\local\resultados.json` | Resultado en JSON |
| `resultados\local\junit.xml` | Resultado en JUnit |
| `evidencias\local\CP-XX.json` | Cada petición del caso con quién la hizo, el cuerpo, el código HTTP y la respuesta |
| `evidencias\capturas\local\` | Capturas de los casos de la web |

Para guardar una ejecución con otro nombre: `$env:EJECUCION="mi-prueba"; npx playwright test`
(queda en `resultados\mi-prueba\` y `evidencias\mi-prueba\`).

En el repositorio ya vienen los resultados oficiales de las tres ejecuciones del 16/11/2026 en
`resultados\ejecucion-1..3\` y `evidencias\ejecucion-1..3\`.

---

## 7. Tres ejecuciones seguidas + cobertura de código de la API

La cobertura necesita arrancar la API con `c8`, así que **la API no puede estar corriendo** de antes.

1. En la terminal de la aplicación, detén `npm run dev` con `Ctrl + C`.
2. Deja solo la web encendida:

   ```powershell
   cd playwright\Hackaton
   npm run dev -w @campus/web
   ```

3. En la terminal de las pruebas:

   ```powershell
   npm run cobertura              # una ejecución con cobertura
   npm run tres-ejecuciones       # tres ejecuciones seguidas con cobertura (unos 15 minutos)
   ```

El script arranca la API con c8 (mediante `cobertura\servidor-api.mjs`, que solo importa `apps/api/src/main.ts` sin
modificarlo), corre la suite, apaga la API limpiamente y deja:

| Dónde | Qué hay |
|---|---|
| `cobertura\reporte-api\index.html` | Reporte HTML de cobertura (ábrelo con doble clic) |
| `cobertura\reporte-api\resumen-consola.txt` | Tabla por archivo y totales |
| `resultados\ejecuciones.json` | Duración y código de salida de cada ejecución |
| `resultados\ejecucion-1..3\` | Reportes de cada una |

Resultado de referencia: líneas 85,82 %, ramas 82,3 %, funciones 91,66 %.

Entre una ejecución y la siguiente la preparación espera cerca de un minuto, porque el último caso deja el ingreso
bloqueado. Es normal ver `Ingreso bloqueado por la ejecución anterior; esperando 53 s`.

Al terminar, vuelve a encender la API normal con `npm run dev` en Hackaton (detén antes la web sola con `Ctrl + C`).

---

## 8. GitHub Actions

El flujo `.github\workflows\pruebas.yml` hace todo lo anterior en un servidor de GitHub: levanta PostgreSQL con pgvector,
descarga la aplicación en el commit `16ebe4d`, carga los datos, enciende la API y la web, corre la suite y guarda los
reportes como artefactos.

- Se ejecuta solo con cada `git push` a la rama `main`.
- También se puede lanzar a mano: pestaña **Actions** del repositorio → **Pruebas de la auditoría** → **Run workflow**.
- El flujo termina en rojo porque los 11 casos de los defectos fallan; eso es lo esperado. Los reportes se descargan desde
  la sección **Artifacts** de la ejecución.

---

## 9. Problemas comunes

| Síntoma | Causa | Solución |
|---|---|---|
| `No se pudo iniciar sesión como supervisor: HTTP 429` | Una ejecución anterior terminó con el bloqueo de ingresos | Espera 1 minuto y vuelve a correr (la preparación también lo espera sola) |
| `fetch failed` o `ECONNREFUSED` en la preparación | La API no está encendida | Revisa la terminal de `npm run dev` y `curl.exe http://localhost:4000/api/health` |
| `npm run cobertura` dice que la API ya está encendida | `npm run dev` sigue corriendo | Detenlo y deja solo `npm run dev -w @campus/web` |
| `Can't reach database server at localhost:5434` | Docker Desktop cerrado o contenedor apagado | Abre Docker Desktop y corre `npm run db:up` en Hackaton |
| Puerto 5434, 4000 o 5173 ocupado | Quedó otro proceso corriendo | `Get-NetTCPConnection -LocalPort 4000` para ver el proceso y cerrarlo |
| Casos de la web fallan por tiempo | La web no está en http://127.0.0.1:5173 | Revisa que `npm run dev` muestre la web; si usa otra dirección: `$env:WEB_URL="http://..."` |
| Muchos casos con 429 al crear reportes | Se corrieron casos sueltos muchas veces seguidas | La API admite 30 reportes por minuto; espera un minuto |
| `Cannot find module ... Hackaton\packages\shared` | La aplicación no está en `..\..\Hackaton` | Define `$env:APP_DIR` (sección 1) |
| La consola se queda quieta un minuto | Es la espera de 61 s de la preparación | Normal |

---

## 10. Apagar todo

```powershell
# En la terminal de la aplicación: Ctrl + C para detener npm run dev
cd playwright\Hackaton
docker compose stop postgres     # apaga la base sin borrar los datos
```

Para borrar también los datos de la base: `docker compose down -v` (la próxima vez hay que repetir `db:up`, `db:deploy` y
`db:seed`).
