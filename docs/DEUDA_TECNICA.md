# Registro de deuda técnica — MVP Hotel Lazzaro

> **Estado del código:** 4 de noviembre de 2026 (rama `main`, después del
> plan 16). Lo cita el _Informe de arquitectura_ del grupo 03, del 4 de
> noviembre de 2026.
>
> **Origen de cada punto:**
>
> - 📄 **Del informe:** D-01 a D-05, D-08, D-10 a D-12, D-14 y D-15. Cada uno
>   se comprobó contra el código; la evidencia va en su ficha.
> - 🔎 **Reconstruido desde el código:** D-06, D-07, D-09, D-13 y D-16. El
>   informe solo daba su ID, su severidad (4 medias y 2 bajas en total,
>   contando D-14) y su lugar en el orden propuesto. **El grupo debe confirmar
>   que coinciden con lo que quiso decir.**
>
> Esfuerzo: **S** ≈ un día, **M** ≈ una semana, **L** ≈ más de una semana
> (para una persona del equipo).

## Resumen

La base es sana: las invariantes de negocio se protegen en PostgreSQL y se
prueban con concurrencia real, el código no tiene `any`, `@ts-ignore` ni
`TODO`. La deuda está en **cómo se opera y se mantiene** el sistema, no en lo
que hace.

| ID   | Deuda                                                                                  | Severidad | Esfuerzo | Cuándo                   | Origen |
| ---- | -------------------------------------------------------------------------------------- | --------- | -------- | ------------------------ | ------ |
| D-01 | Sesión en `localStorage`, 8 horas (revocación ✅ desde el plan 18)                     | **Alta**  | M        | Antes de producción      | 📄     |
| D-02 | ✅ ~~Sin integración continua~~ (resuelta el 4 nov 2026; falta proteger `main`)        | **Alta**  | S        | Hecho                    | 📄     |
| D-03 | Wompi probado solo en simulación                                                       | **Alta**  | S        | Antes de producción      | 📄     |
| D-04 | Tareas programadas sin bloqueo entre instancias                                        | Media     | S        | Ya                       | 📄     |
| D-05 | `JWT_SECRET` validado solo por presencia                                               | Media     | S        | Ya                       | 📄     |
| D-06 | Sin observabilidad ni respaldos de la base                                             | Media     | M        | Antes de producción      | 🔎     |
| D-07 | ✅ ~~Dependencias del backend con vulnerabilidades altas~~ (resuelta el 4 nov 2026)    | Media     | S        | Hecho                    | 🔎     |
| D-08 | Servicios muy grandes (reservas, agenda, folio)                                        | Media     | M        | Mantenimiento por módulo | 📄     |
| D-09 | Sin histórico de estados de habitación                                                 | Media     | M        | Mantenimiento por módulo | 🔎     |
| D-10 | Navegación sin router                                                                  | Media     | M        | Mantenimiento por módulo | 📄     |
| D-11 | Tipos y cliente de la API copiados a mano                                              | Media     | L        | Mantenimiento por módulo | 📄     |
| D-12 | El saldo se calcula en el servidor y en el cliente                                     | Media     | S        | Mantenimiento por módulo | 📄     |
| D-13 | ✅ ~~Swagger publicado también en producción~~ (resuelta el 4 nov 2026)                | Baja      | S        | Hecho                    | 🔎     |
| D-14 | Páginas y componentes del frontend sin pruebas                                         | Media     | M        | Mantenimiento por módulo | 📄     |
| D-15 | Listados sin límite de resultados                                                      | Media     | M        | Mantenimiento por módulo | 📄     |
| D-16 | ✅ ~~Imagen Docker y `docker-compose` pensados para la demo~~ (resuelta el 4 nov 2026) | Baja      | S        | Hecho                    | 🔎     |

**Orden propuesto por el informe:**

1. Barato y urgente: D-02, D-05, D-07, D-04, D-16 y D-13.
2. Antes de cobrar en producción: D-03, D-01 y D-06.
3. El resto, como mantenimiento continuo de cada módulo, cuando se toque.

---

## Fichas

### D-01 · Sesión guardada en `localStorage` — Alta · M 📄

- **Evidencia:** `frontend/src/api/client.ts:98-108` guarda la sesión (con el
  JWT) en `localStorage`. `backend/src/auth/auth.module.ts:19` firma el token
  con `expiresIn: '8h'`. No hay lista de tokens revocados ni un token de
  refresco.
- **Riesgo:** cualquier XSS (código malicioso inyectado en la página) puede
  leer el token y usarlo durante 8 horas. Desactivar al usuario lo bloquea,
  porque la guardia relee el usuario en cada petición (R32), pero "cerrar
  sesión en todos los dispositivos" no existe.
- **Propuesta:** una cookie `httpOnly`, `Secure`, `SameSite=Strict`, con un
  token de acceso corto (15 minutos) y uno de refresco rotativo, guardado en
  la base para poder revocarlo. Si el módulo se integra al inicio de sesión de
  Lazaro, esta decisión depende del suyo (es una pregunta abierta para el
  arquitecto).
- **Avance (plan 18):** la **revocación ya existe**. El token lleva la versión de
  sesión del usuario (`versionSesion`), y cambiar o restablecer la contraseña o
  reenviar las credenciales la sube: las sesiones abiertas quedan inválidas.
  Falta la sesión en cookie `httpOnly` con un token de acceso corto y uno de
  refresco.

### D-02 · Sin integración continua — Alta · S 📄 · ✅ Resuelta

> **Resuelta el 4 de noviembre de 2026** con `.github/workflows/ci.yml`. En
> cada push a `main`, en cada pull request y a mano, corren tres trabajos en
> paralelo:
>
> - **Lint, formato y auditoría:** `npm run lint`, `npm run format:check` y
>   `npm audit --omit=dev --audit-level=high`, en el backend y en el frontend.
>   Esto evita que D-07 vuelva a pasar en silencio.
> - **Backend:** build y las 499 pruebas contra un PostgreSQL 16 vacío. Las
>   migraciones se aplican desde cero, así que también se prueba que un
>   despliegue nuevo arranca.
> - **Frontend:** las 81 pruebas y el build.
>
> **Pendiente (lo hace el dueño del repo, en GitHub):** proteger `main` en
> _Settings → Branches_, exigiendo que pasen los tres trabajos. Sin eso, el
> flujo avisa pero no impide. Tampoco cubre el `npm` de los paquetes: CI usa
> el que trae Node 24, que puede ignorar el campo `allowScripts` de los
> `package.json` (es más permisivo, no más estricto).

- **Evidencia:** no existe `.github/workflows/`. Las ~580 pruebas, el lint y
  el formato solo corren si alguien los ejecuta a mano.
- **Riesgo:** un cambio que rompe una invariante (por ejemplo, la
  no-sobreventa) puede llegar a `main` sin que nadie lo note.
- **Propuesta:** un flujo de GitHub Actions en cada push y pull request, con un
  servicio de PostgreSQL 16, que corra `npm ci`, `prisma migrate deploy`, las
  pruebas del backend y del frontend, `npm run lint`, `npm run format:check`,
  `npm run build` y `npm audit --omit=dev --audit-level=high`. Proteger la
  rama `main`.

### D-03 · Wompi probado solo en simulación — Alta · S 📄

- **Evidencia:** el plan 14 dejó el adaptador de Wompi probado con respuestas
  de ejemplo y sin conexión a internet (`wompi.adaptador.spec.ts`); el flujo
  completo se probó con la pasarela simulada.
- **Riesgo:** una diferencia entre la documentación de Wompi y su API real
  (nombres de campos, firma) solo aparecería con dinero real.
- **Propuesta:** seguir la lista de [Pagos en línea](PASARELA_WOMPI.md) con
  las llaves de pruebas (sandbox). Está en espera de esas llaves.

### D-04 · Tareas programadas sin bloqueo entre instancias — Media · S 📄

- **Evidencia:** tres `@Cron(EVERY_10_MINUTES)`:
  `reservas.service.ts:1154` (no-shows), `pagos-en-linea.service.ts:268`
  (reconciliación) y `limpieza.service.ts:184` (repasos diarios). Según el
  informe, con dos instancias del backend dos de ellas se ejecutarían dos
  veces. La de limpieza ya está protegida por el índice único de la tarea.
- **Riesgo:** hoy hay una sola instancia, así que el riesgo es nulo. Aparece
  en el momento en que se escale horizontalmente.
- **Propuesta:** envolver cada tarea en `pg_try_advisory_lock(<id fijo por
tarea>)`: si otra instancia la tiene, se salta esa vuelta. Es más simple que
  una cola de trabajos y no agrega infraestructura.

### D-05 · `JWT_SECRET` validado solo por presencia — Media · S 📄

- **Evidencia:** `auth.module.ts:14-16` solo falla si la variable falta. El
  valor de `backend/.env.example`
  (`cambia-este-valor-por-uno-largo-y-aleatorio`) se aceptaría.
- **Riesgo:** un despliegue que copió el ejemplo tendría sesiones que
  cualquiera puede falsificar.
- **Propuesta:** al arrancar, rechazar los valores de ejemplo conocidos y los
  de menos de 32 caracteres (como ya hace `CLAVE_CIFRADO_PAGOS` en
  `pagos-en-linea/cifrado.ts`). Con una prueba.

### D-06 · Sin observabilidad ni respaldos de la base — Media · M 🔎

- **Evidencia:** el backend registra con un solo `console.log` (`main.ts`) y
  el `Logger` de Nest aparece en 3 archivos. No hay logs estructurados, ni un
  id de petición, ni métricas, ni alertas. Existe `GET /salud`
  (`salud.controller.ts`), pero no hay estrategia de respaldo ni de
  restauración de PostgreSQL.
- **Riesgo:** con un hotel real cobrando, un fallo del webhook, de una tarea
  programada o de la base pasaría inadvertido, y una pérdida de datos no
  tendría recuperación.
- **Propuesta (el mínimo antes del primer hotel):** logs en JSON con
  `nestjs-pino`, un id de petición que se propague y aparezca en las
  respuestas de error, un registro de errores de las tareas programadas y del
  webhook, una alerta cuando `/salud` falle, y un respaldo diario automático
  de la base, **con una prueba de restauración documentada**.

### D-07 · Dependencias del backend con vulnerabilidades altas — Media · S 🔎 · ✅ Resuelta

> **Resuelta el 4 de noviembre de 2026.** `npm audit fix`; Nest 11 subido al
> último parche (`@nestjs/common`, `core`, `platform-express` y `testing`
> en `^11.2.8`); `multer` fijado en `^2.5.0` con `overrides`, porque
> `@nestjs/platform-express@11.2.8` aún trae la 2.4.0 vulnerable, y la
> única otra salida era pasar a Nest 12. Resultado: `npm audit --omit=dev`
> → **0 vulnerabilidades**. En las dependencias de desarrollo quedan 22
> avisos bajos y moderados, ninguno alto. Las 499 pruebas del backend y
> las 81 del frontend pasan. Lo que falta es la parte de la integración
> continua, que queda en D-02.

- **Evidencia:** `npm audit --omit=dev` en `backend/` (4 de noviembre de 2026)
  da 6 avisos: **3 altos** (`multer` y `body-parser`, que llegan por
  `@nestjs/platform-express`) y 3 moderados (`js-yaml` por `@nestjs/swagger`,
  y `qs`). Todos tienen arreglo disponible. El frontend no tiene avisos en sus
  dependencias de producción.
- **Riesgo:** son de denegación de servicio (una petición armada puede
  bloquear el proceso). Además, la sección de dependencias del `README.md`
  dice "sin vulnerabilidades altas", y eso ya no es cierto.
- **Propuesta:** `npm audit fix` en `backend/`, correr las pruebas y
  actualizar el `README`. Que la integración continua (D-02) falle con avisos
  altos, para que no vuelva a pasar en silencio.

### D-08 · Servicios muy grandes — Media · M 📄

- **Evidencia:** `reservas/reservas.service.ts` tiene 1.287 líneas,
  `agenda/agenda.service.ts` 865 y `folio/folio.service.ts` 671.
- **Riesgo:** cambios más lentos y más propensos a errores; es difícil ver
  qué regla protege cada método.
- **Propuesta:** cortar por **subdominio**, que es como el negocio lo nombra:
  reserva (crear, modificar, cancelar), estadía (check-in, check-out, salida
  anticipada) y no-shows; y en el folio, separar los cargos de los pagos. Se
  hace al tocar cada módulo, con las pruebas e2e actuales como red, y es
  compatible con el refactor hexagonal de la hoja de ruta.

### D-09 · Sin histórico de estados de habitación — Media · M 🔎

- **Evidencia:** `Habitacion.estado` guarda solo el estado actual
  (`schema.prisma`). El panel de gerencia (plan 11) cuenta las habitaciones
  disponibles de **todo el período** con el estado de hoy; el informe lo
  anota como el costo de no tener un almacén de datos.
- **Riesgo:** si una habitación estuvo fuera de servicio la semana pasada y
  hoy está libre, la ocupación, el RevPAR y el ADR de ese período salen mal.
  El error crece con el tamaño del período consultado.
- **Propuesta:** una tabla `cambio_estado_habitacion` (habitación, estado
  anterior y nuevo, fecha, usuario), escrita en la misma transacción que cada
  cambio de estado. El cálculo de los indicadores (`panel/indicadores.ts`,
  que es puro) recibiría los intervalos de "fuera de servicio" en lugar del
  estado de hoy.

### D-10 · Navegación sin router — Media · M 📄

- **Evidencia:** `frontend/src/App.tsx` cambia de pantalla con un estado de
  React (`useState<Pestana>`); el frontend no usa `react-router`.
- **Riesgo:** ninguna pantalla tiene su URL: no se puede compartir el enlace a
  una reserva, el botón "atrás" del navegador saca de la app, y al recargar
  se vuelve al inicio.
- **Propuesta:** `react-router` con una ruta por pestaña y por detalle
  (`/reservas/:id`). Se puede migrar pestaña por pestaña.

### D-11 · Tipos y cliente de la API copiados a mano — Media · L 📄

- **Evidencia:** `frontend/src/api/types.ts` (965 líneas) y `client.ts` (765)
  repiten a mano lo que ya describen los DTOs del backend y Swagger.
- **Riesgo:** si un DTO cambia y nadie actualiza el frontend, el error solo
  aparece cuando alguien usa la pantalla. D-14 lo agrava.
- **Propuesta:** generar los tipos desde el OpenAPI que ya publica Swagger
  (`openapi-typescript`), con un script `npm run api:tipos` y una verificación
  en la integración continua de que están al día. Migrar el cliente poco a
  poco.

### D-12 · El saldo se calcula en el servidor y en el cliente — Media · S 📄

- **Evidencia:** el backend calcula el estado de cuenta en
  `folio/folio.service.ts`, y el frontend repite cálculos de saldo en
  `frontend/src/logica/pagos.ts` y `logica/empresas.ts`.
- **Riesgo:** las dos versiones pueden dar resultados distintos (por
  redondeo, o por una regla nueva que solo se cambió en un lado), y la
  pantalla mostraría un saldo que el servidor no acepta. Contradice la regla
  del repo: "el frontend no tiene reglas de negocio propias".
- **Propuesta:** el frontend muestra el saldo que devuelve el servidor y solo
  calcula lo que es de interfaz (por ejemplo, cuánto falta por repartir
  entre los medios de pago del check-out, a partir del saldo del servidor).

### D-13 · Swagger publicado también en producción — Baja · S 🔎 · ✅ Resuelta

> **Resuelta el 4 de noviembre de 2026.** `debePublicarDocumentacion(env)` en
> `backend/src/documentacion.ts` (función pura, con `documentacion.spec.ts`):
> `/docs` no se publica con `NODE_ENV=production`, salvo con
> `PUBLICAR_DOCS=true`; `PUBLICAR_DOCS=false` la apaga siempre. Se comprobó
> con la imagen de Docker: en producción `/docs` responde 404 y `/salud` 200.

- **Evidencia:** `main.ts` llama a `publicarDocumentacion(app)` siempre;
  `documentacion.ts` no revisa el ambiente.
- **Riesgo:** en producción, `/docs` muestra a cualquiera el mapa completo de
  la API. No da acceso (todo pide sesión, salvo el login, la marca pública, `/salud`
  y el webhook), pero facilita el reconocimiento a un atacante.
- **Propuesta:** publicar `/docs` solo si `NODE_ENV !== 'production'` o si
  `PUBLICAR_DOCS=true`.

### D-14 · Páginas y componentes del frontend sin pruebas — Media · M 📄

- **Evidencia:** las 81 pruebas del frontend están en `frontend/src/logica/`
  (18 archivos). `components/` y `pages/` tienen 0 pruebas.
- **Riesgo:** los flujos de pantalla (check-in con ocupantes, check-out con
  varios medios de pago, el importador) pueden romperse sin que ninguna
  prueba falle.
- **Propuesta:** Testing Library con Vitest para los 4 o 5 flujos que mueven
  dinero o datos legales. No buscar cobertura completa.

### D-15 · Listados sin límite de resultados — Media · M 📄

- **Evidencia:** el backend tiene 63 llamadas a `findMany`; según el informe,
  solo 4 tienen `take` (un conteo propio con `grep` encuentra 2).
- **Riesgo:** las tablas solo crecen (anular en lugar de borrar): con unos
  años de historial, la lista de reservas, de huéspedes o de movimientos se
  vuelve lenta y pesada para el navegador.
- **Propuesta:** paginación **por cursor** (`id` + fecha) en los listados
  que crecen sin límite (reservas, huéspedes, movimientos, auditoría), y un
  `take` máximo en el resto. Por página solo donde el usuario necesite saltar
  a una página concreta.

### D-16 · Imagen Docker y `docker-compose` pensados para la demo — Baja · S 🔎 · ✅ Resuelta

> **Resuelta el 4 de noviembre de 2026.**
>
> - `backend/Dockerfile` en dos etapas. La final solo tiene las dependencias
>   de producción (sin Jest, TypeScript propio ni la CLI de Nest), `dist/` y
>   `prisma/`; corre como el usuario `node` y tiene un `HEALTHCHECK` contra
>   `/salud`. `prisma` pasó a `dependencies` porque el contenedor aplica las
>   migraciones al arrancar.
> - `docker-compose.yml`: PostgreSQL publicado solo en `127.0.0.1:5432`, la
>   contraseña tomada de `POSTGRES_PASSWORD` (por defecto `hotel`), y la
>   cabecera dice que es solo para desarrollo y demo. El backend de la demo
>   corre con `NODE_ENV=development` para conservar `/docs` y la pasarela
>   simulada.
> - Efecto secundario: Docker Desktop en Windows no publica el puerto en IPv6,
>   y `localhost` intenta primero `::1`. Las conexiones se volvieron lentas y
>   3 pruebas de concurrencia fallaban por tiempo. Por eso las URLs de
>   conexión (`.env.example`, `test/entorno.ts` y la CI) usan `127.0.0.1`.

- **Evidencia:** `backend/Dockerfile` es de una sola etapa: instala las
  dependencias de desarrollo, copia todo el código y corre como `root`.
  `docker-compose.yml` crea PostgreSQL con el usuario y la contraseña
  `hotel`/`hotel` y publica el puerto 5432.
- **Riesgo:** sirve para la demo, pero si alguien la reutiliza para un
  despliegue real, la base queda expuesta con una contraseña conocida.
- **Propuesta:** un `Dockerfile` en varias etapas, solo con las dependencias
  de producción y con un usuario sin privilegios; en el `compose`, la
  contraseña tomada de una variable y sin publicar el puerto 5432 en el
  perfil `demo`. Indicar en el `README` que este `compose` es solo para
  demostración.

---

## Riesgos vigilados (decisiones aceptadas, no son deuda)

Son costos conocidos de decisiones de diseño (ver
[Arquitectura](ARQUITECTURA.md), sección 5). Se revisan si cambia el
contexto.

| Tema                                                                                                                | Por qué se acepta hoy                                                             | Qué lo volvería deuda                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Sin seguridad a nivel de fila (RLS) en PostgreSQL: el aislamiento depende de que cada consulta filtre por `hotelId` | Hay pruebas de aislamiento sobre cada recurso, y un id de otro hotel responde 404 | Que entren desarrolladores que no conocen la convención, o un hotel con datos sensibles por contrato. Entonces, RLS como segunda barrera |
| Ligado a PostgreSQL (`EXCLUDE USING gist`, escrita a mano en la migración)                                          | Es lo que hace imposible la sobreventa                                            | Ninguno previsible: es una decisión deliberada                                                                                           |
| El desglose congelado (JSON) se recorre en cada consulta de indicadores                                             | Con 10 a 80 habitaciones, un año son unas 30.000 noches                           | Que los indicadores tarden más de 1 segundo, o consultas de varios años                                                                  |
| El saldo se calcula recorriendo los pagos                                                                           | Garantiza que nunca se desincroniza                                               | Folios con miles de movimientos (no ocurre en estadías de hotel)                                                                         |
| Las tablas solo crecen (anular en lugar de borrar)                                                                  | Trazabilidad legal y contable                                                     | Mitigarlo con D-15, y después definir un archivado por antigüedad                                                                        |
| Límite de intentos de login y del webhook en memoria (`@nestjs/throttler`)                                          | Hay una sola instancia                                                            | Varias instancias: cada una lleva su propia cuenta. Entonces, guardar el contador en un almacén compartido                               |
| Integración con Lazaro (.NET) por HTTP, con stack propio                                                            | El módulo es un prototipo independiente                                           | La decisión de integrarlo o reescribirlo (pregunta abierta para el arquitecto)                                                           |

## Cómo se mantiene este registro

- Una deuda nueva entra con el siguiente ID libre, su evidencia (archivo y
  línea) y su propuesta.
- Al resolver una, se marca con ✅, la fecha y el commit; no se borra.
- Se revisa antes de cada entrega al empresario.
