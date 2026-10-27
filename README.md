# MVP — Módulo hotelero

MVP funcional cuyo objetivo central es **reservar una habitación por fechas sin que
pueda venderse dos veces** (no-sobreventa), de punta a punta: interfaz → API → base
de datos.

Documentos:

- [Reglas de negocio](docs/REGLAS_DE_NEGOCIO.md): qué reglas protege el módulo y su estado.
- [Arquitectura](docs/ARQUITECTURA.md): módulos, invariantes y dónde se protegen, hoja de ruta.
- [Backlog priorizado](docs/BACKLOG.md): comparación con PMS del mercado y qué desarrollar después.
- [Registro legal de huéspedes](docs/REGISTRO_LEGAL_HUESPEDES.md): datos que exigen TRA, SIRE, menores y protección de datos, y qué falta.
- [Guion de la demo](docs/GUION_DEMO.md): recorrido de 15 minutos y preguntas probables.
- [Presentación](docs/presentacion/Propuesta_Modulo_Hotelero.pptx) y
  [documento técnico y propuesta (PDF)](docs/presentacion/Documento_Tecnico_y_Propuesta.pdf).

## Stack

- Backend: NestJS 11 + TypeScript + Prisma + PostgreSQL
- Frontend: React 19 + Vite + TypeScript
- Entorno local: Docker Compose (PostgreSQL; con el perfil `demo`, toda la app)

## Demo con un solo comando (Docker)

Requisito: Docker Desktop. Desde la raíz del repo:

```bash
cp backend/.env.example backend/.env    # solo la primera vez (cambia JWT_SECRET)
docker compose --profile demo up -d --build
docker compose --profile demo run --rm backend node dist/prisma/seed.js
```

- App: `http://localhost:8080` · API: `http://localhost:3000` · Swagger:
  `http://localhost:3000/docs`. Las credenciales de prueba están en
  `backend/.env.example`.
- Antes de cada presentación, el último comando (seed) reinicia los escenarios
  de la demo con fechas relativas a hoy.
- Para apagarla: `docker compose --profile demo down` (los datos quedan en el
  volumen). No la levantes a la vez que el backend de desarrollo: ambos usan el
  puerto 3000.

## Cómo levantarlo para desarrollo

Requisitos: Node.js 24, Docker Desktop.

### 1. Base de datos

```bash
docker-compose up -d
```

Esto levanta PostgreSQL en `localhost:5432` (usuario `hotel`, password `hotel`,
base `mvp_hotel`).

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env      # config de docker-compose; cambia JWT_SECRET por un valor aleatorio
npx prisma migrate dev    # crea las tablas + la restricción reserva_sin_sobreventa
npm run seed               # usuarios iniciales + habitaciones + 7 reservas de demo
npm run start:dev
```

El backend queda escuchando en `http://localhost:3000`.

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env      # ya apunta a http://localhost:3000
npm run dev
```

El frontend queda disponible en `http://localhost:5173`.

## Documentación de la API

Con el backend corriendo, la documentación interactiva (Swagger) está en
`http://localhost:3000/docs`. Para probar endpoints protegidos: ejecuta
`POST /auth/login`, copia el `token` y pégalo en **Authorize**. El chequeo de
salud (`GET /salud`) es público y verifica también la conexión a la base.

## Seguridad básica

- **Límite de intentos de login**: `LOGIN_INTENTOS_POR_MINUTO` por IP (5 por
  defecto); al superarlo responde `429`.
- **CORS**: solo los orígenes de `CORS_ORIGENES` (por defecto el frontend en
  `http://localhost:5173`) pueden llamar a la API desde un navegador.
- **Cabeceras de seguridad** con `helmet`.

## Plataforma multi-hotel

La misma instalación atiende a varios hoteles, cada uno con sus datos aislados
y su propia configuración. Hay tres niveles de acceso:

| Nivel     | Panel                  | Rol                      | Qué hace                                                                                                 |
| --------- | ---------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------- |
| Lazaro    | **Consola Lazaro**     | `plataforma`             | Crea hoteles, da acceso a su personal, suspende o reactiva hoteles. No opera reservas.                   |
| Hotel     | **Gerencia del hotel** | `admin`                  | Marca (logo, colores, tipografías), políticas, temporadas, precios, catálogo de consumos, equipo y datos |
| Operación | La app de recepción    | `admin`, `recepcionista` | Reservas, check-in/out, folio, calendario, huéspedes, habitaciones                                       |

- Cada hotel tiene su ingreso con marca: `http://localhost:5173/?hotel=<identificador>`.
- Las reglas nuevas aplican a las reservas nuevas: el precio y la política de cancelación quedan pactados en cada reserva.

## Usuarios y permisos

Todo el sistema exige iniciar sesión. `npm run seed` crea el usuario de la
**Consola Lazaro** (`PLATAFORMA_*`) y, para cada hotel de demo, un
**administrador** y un **recepcionista** (`ADMIN_*` y `RECEPCION_*` para Hotel
Andino; `SOL_ADMIN_*` y `SOL_RECEPCION_*` para Sol Caribe). Los valores de
desarrollo están en `backend/.env.example`. Cambia esas contraseñas desde la
app ("Contraseña").

| Permiso                                                                     | Recepcionista | Administrador |
| --------------------------------------------------------------------------- | :-----------: | :-----------: |
| Ver habitaciones y disponibilidad                                           |      ✅       |      ✅       |
| Crear habitaciones                                                          |       —       |      ✅       |
| Ver, crear y cancelar reservas                                              |      ✅       |      ✅       |
| Check-in / check-out                                                        |      ✅       |      ✅       |
| Cargar y anular consumos del folio                                          |      ✅       |      ✅       |
| Marcar habitaciones listas o fuera de servicio                              |      ✅       |      ✅       |
| Editar tarifas y tipos de habitación                                        |       —       |      ✅       |
| Revisar no-shows                                                            |      ✅       |      ✅       |
| Gestionar usuarios (crear, cambiar rol, desactivar, restablecer contraseña) |       —       |      ✅       |

- Los permisos por rol están en `backend/src/auth/permisos.ts`; los endpoints
  piden permisos, no roles. Una guardia global protege todo salvo
  `POST /auth/login`.
- Desactivar a un usuario o cambiarle el rol aplica **de inmediato**, aunque
  tenga la sesión abierta. Un administrador no puede desactivarse ni quitarse
  el rol a sí mismo, así que el sistema nunca se queda sin administradores.
- Contraseñas con hash `scrypt` (mínimo 8 caracteres). La sesión dura 8 horas.
- Al abrir la app, el frontend vuelve a pedir los permisos (`GET /auth/yo`).

## Cómo probar el caso central: la reserva solapada

1. Abre el frontend, ve a **Nueva reserva**, elige un rango de fechas (p. ej.
   10 al 15 de un mes futuro), pulsa **Ver disponibles**, selecciona una
   habitación y confirma con datos de huésped de prueba. Debe crearse (201).
2. Repite el proceso con un rango que se solape (p. ej. 12 al 18) y elige la
   **misma habitación**. El backend responde `409 Conflict` y el frontend
   muestra el mensaje de error — la reserva no se crea.
3. Alternativa por API (curl): primero inicia sesión y copia el `token` de la
   respuesta; luego reemplaza `TOKEN` y `HABITACION_ID` (usa fechas futuras):

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"CORREO","contrasena":"CONTRASENA"}'

curl -X POST http://localhost:3000/reservas \
  -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"habitacionId":"HABITACION_ID","huesped":{"nombre":"Juan Perez","documento":"123"},"fechaEntrada":"2026-11-10","fechaSalida":"2026-11-15"}'

# Repetir con fechas solapadas -> debe responder 409, no 500
curl -i -X POST http://localhost:3000/reservas \
  -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"habitacionId":"HABITACION_ID","huesped":{"nombre":"Maria Lopez","documento":"456"},"fechaEntrada":"2026-11-12","fechaSalida":"2026-11-18"}'
```

La garantía real contra la sobreventa no es solo la validación previa en el
servicio: es la restricción `reserva_sin_sobreventa` (EXCLUDE USING gist) en
PostgreSQL, definida en
`backend/prisma/migrations/20260928231947_init/migration.sql`. Esa restricción
rechaza de forma atómica dos reservas solapadas aunque lleguen al mismo tiempo,
y el servicio traduce ese error de PostgreSQL a un `409` en vez de un `500`.

## Calidad de código

ESLint y Prettier se configuran una sola vez en la raíz para backend y frontend:

```bash
npm install          # en la raíz del repo: instala solo las herramientas de calidad
npm run lint         # revisa errores comunes (TypeScript y hooks de React)
npm run format       # aplica el formato del proyecto
```

Antes de cada commit: `npm run lint` y `npm run format:check` deben pasar.

### Dependencias (`npm audit`)

- Frontend y raíz: sin vulnerabilidades conocidas.
- Backend: sin vulnerabilidades altas ni críticas. Quedan avisos **moderados**
  de `js-yaml` / `sprintf-js` que llegan por `@nestjs/swagger` (corregirlos
  exige migrar a Nest 12) y por la cobertura de Jest (solo desarrollo). Son de
  denegación de servicio al procesar YAML o formatos externos, algo que esta API
  no hace: la documentación se genera desde el propio código.
- `deepmerge-ts` se fuerza a la versión 8 (`overrides`) para cerrar el aviso
  alto que llegaba por la CLI de Prisma.

## Pruebas del frontend

```bash
cd frontend
npm test            # Vitest: cálculo del calendario y agrupado del desglose
```

La lógica sin React vive en `frontend/src/logica/` para poder probarla.

## Pruebas automáticas (backend)

Pruebas e2e con Jest + supertest contra un PostgreSQL real (la restricción
`EXCLUDE` no se puede simular con mocks). Usan una base aparte,
`mvp_hotel_test`, que se vacía entre pruebas; la de desarrollo no se toca.

```bash
docker exec mvp_hotel_postgres psql -U hotel -d postgres -c "CREATE DATABASE mvp_hotel_test;"   # solo la primera vez
cd backend
npm test
```

Las migraciones se aplican solas antes de la suite. Para usar otra base, define
`DATABASE_URL_TEST` (su nombre debe contener `_test`).

Cubren: no-sobreventa (solapamientos, reservas contiguas, cancelada/cerrada no
bloquea, 10 peticiones concurrentes → una sola gana, la BD rechaza el
solapamiento aunque se salte el servicio), check-in/check-out con sus
transiciones inválidas y el cálculo del total (cruce de mes, de año y año
bisiesto), disponibilidad por rango, reglas de cancelación y no-show, y
usuarios y permisos (401 sin sesión, 403 por rol, desactivación inmediata).

## Flujo completo de una reserva

Las reglas de negocio están en [docs/REGLAS_DE_NEGOCIO.md](docs/REGLAS_DE_NEGOCIO.md)
(los IDs R1…R29 se citan en el código).

1. **Disponibilidad**: `GET /habitaciones/disponibles?desde=...&hasta=...`
   (no se consultan fechas pasadas).
2. **Reservar**: `POST /reservas` con habitación + huésped + fechas → estado
   `confirmada`. El precio (`valorAlojamiento`) se **congela** en este momento.
   Entrada desde hoy, máximo 30 noches y 365 días de antelación.
3. **Check-in**: `POST /reservas/:id/check-in` → reserva `activa`, habitación
   `ocupada`. Desde la fecha de entrada hasta el mediodía del día siguiente.
4. **Check-out**: `POST /reservas/:id/check-out` → reserva `cerrada`,
   `total` = precio pactado, habitación vuelve a `libre`.
5. **Cancelar**: `POST /reservas/:id/cancelar` (solo `confirmada`) → gratis
   hasta 48 h antes de las 15:00 del día de entrada; después, 1 noche de
   penalidad en `total`. Las fechas quedan libres de inmediato.
6. **No-show**: una tarea programada (cada 10 min) marca `no_show` las
   reservas sin check-in pasado el mediodía del día siguiente a la entrada,
   cobra 1 noche y libera las noches restantes. Se puede forzar con
   `POST /reservas/no-shows/procesar`.

Las horas se calculan en hora de Colombia (UTC-5).

### Tarifas (bloque B)

- **Tipos de habitación** (`/tipos-habitacion`): tarifa base (temporada baja),
  capacidad incluida y máxima, y cargo por persona adicional por noche. El
  admin los edita en la pestaña **Tarifas**; aplica a las reservas nuevas.
- **Temporadas** (`GET /tarifas/temporadas?anio=`): alta (15 dic–15 ene,
  Semana Santa, 15 jun–15 jul) ×1,30; media (puentes festivos) ×1,15; baja el
  resto. La Pascua y los festivos de Colombia (Ley Emiliani) se **calculan**
  para cualquier año (`backend/src/tarifas/`, con pruebas unitarias).
- **Cada noche se cobra según su temporada**; IVA 19 % (exento con pasaporte).
  El desglose se congela en la reserva (`desglose`) y la penalidad de
  cancelación / no-show es el valor real de la primera noche.
- La disponibilidad recibe `huespedes`, excluye habitaciones sin capacidad y
  devuelve la `cotizacion` de cada una.

### Folio y consumos (bloque C)

- Durante la estadía (solo `activa`) recepción carga consumos a la habitación
  (`POST /reservas/:id/cargos`: minibar, lavandería, restaurante, late
  check-out, otro). Un cargo no se borra: se **anula** con motivo
  (`POST /reservas/:id/cargos/:cargoId/anular`). Todo queda en la auditoría.
- `GET /reservas/:id/folio`: alojamiento pactado + consumos vigentes = total.
- El **check-out liquida el folio** y exige `{ "medioPago": "efectivo" |
"tarjeta" | "transferencia" }`. Después del cierre no se admiten cargos.
  Un cargo que llega justo durante el check-out espera (bloqueo de la fila de
  la reserva) y nunca queda fuera de la liquidación.
- **Salida anticipada (R24)**: si el check-out es antes de la fecha pactada se
  cobran solo las noches usadas (mínimo una), tomadas del desglose congelado;
  la salida se adelanta y las noches restantes quedan libres. El folio
  (`salidaAnticipada`) y el modal de check-out lo muestran antes de confirmar.

### Registro hotelero (R19)

El check-in exige `{ "nacionalidad": "CO", "procedencia": "Bogotá",
"motivoViaje": "turismo" | "negocios" | "salud" | "eventos" | "otro" }`. La
nacionalidad queda en el huésped (se precarga si vuelve); procedencia y motivo,
en la estadía. `GET /reservas/registro-hotelero?fecha=` devuelve los check-ins
de un día de llegada con los datos de la Tarjeta de Registro Hotelero y marca a
los extranjeros (reporte a Migración). En la app: **Huéspedes → Registro
hotelero**.

### Estados de la habitación

`libre → ocupada` (check-in) `→ en_limpieza` (check-out) `→ libre` (recepción
la marca lista). El check-in exige la habitación libre. Una habitación
`fuera_servicio` no se ofrece ni admite reservas nuevas; al sacarla de servicio
la API informa cuántas reservas futuras hay que reubicar.
`PATCH /habitaciones/:id/estado` con `{ "estado": "libre" | "fuera_servicio" }`
(permiso `habitaciones:estado`, recepción y admin). El panel "Hoy" muestra las
habitaciones por limpiar y calcula la ocupación sobre las que están en servicio.

### Panel "Hoy" y calendario

- **Hoy** (`GET /panel/hoy`, primera pantalla al entrar): ocupación de esta
  noche, huéspedes alojados, llegadas y salidas pendientes (con check-in /
  check-out directo; las atrasadas se marcan) e ingresos del mes (estadías
  liquidadas con salida en el mes + penalidades de reservas del mes).
- **Calendario** (`GET /panel/calendario?desde=&dias=`): habitaciones × días
  con las reservas como barras por estado; navega de a 14 días (máx. 31).

### Datos de demo

`npm run seed` deja dos hoteles con identidades distintas:

- **Hotel Andino** (Bogotá, azul noche y dorado): habitaciones 101–302 y 7 reservas con fechas relativas a **hoy**, una por escenario:
  - huésped alojado (para check-out);
  - llegada hoy (para check-in);
  - llegada mañana (cancelar cobra penalidad);
  - llegada en 10 días (cancelación gratuita);
  - un no-show pendiente de detectar;
  - una estadía cerrada;
  - una cancelación con penalidad.
- **Sol Caribe** (Cartagena, turquesa y coral):
  - otras reglas: 24 h de cancelación gratuita, 2 noches de penalidad, temporada de playa;
  - otros precios;
  - 4 escenarios propios.

Es repetible: vuelve a correrlo antes de cada demo para reiniciar esos
escenarios y la marca y las políticas de los hoteles de demo. No borra otros
datos.

## Estructura

```
mvp/
├── docker-compose.yml
├── backend/            # NestJS + Prisma
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── seed.ts
│   │   └── migrations/
│   └── src/
│       ├── habitaciones/
│       ├── reservas/
│       └── prisma/
└── frontend/           # React + Vite
    └── src/
        ├── pages/
        ├── components/
        └── api/
```

## Fuera de alcance (a propósito)

Integraciones externas (OTAs, pagos, WhatsApp), consumos automáticos desde el
POS, envío a TRA y Migración, facturación de la plataforma a los hoteles,
arquitectura hexagonal completa y despliegue en la nube.
