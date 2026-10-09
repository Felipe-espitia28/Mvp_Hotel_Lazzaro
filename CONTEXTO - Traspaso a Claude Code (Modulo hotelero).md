# Contexto del proyecto — Módulo hotelero para Lazaro Software
### Documento de traspaso para Claude Code

> **Para qué sirve este archivo.** Reúne todo el contexto, las decisiones técnicas y el estado del proyecto para arrancar un chat de Claude Code sin perder el hilo. Ponlo como archivo del repo (p. ej. `CONTEXT.md`) o pégalo al inicio del chat. Donde algo aún no está decidido, se marca como **(decidir)**.

---

## 1. Qué es el proyecto

Un **módulo hotelero** para **Lazaro Software**, un ERP comercial/administrativo para pymes del sector HORECA (hoteles, restaurantes, cafeterías). Hoy Lazaro maneja los hoteles **reutilizando su modelo de restaurantes** (una habitación se trata como una mesa), lo que no cubre reservas, tarifas por temporada ni integración con Booking. El objetivo es construir un **dominio hotelero propio**: reservas y estadías con tarificación, sin sobreventa.

Es un **proyecto universitario** (Ingeniería de Sistemas, curso de Arquitectura de Software). Equipo de 5: Felipe Espitia, Angel Arenales, Omar Cabezas, Juan Londoño, Johan Ospina.

**Tipo de proyecto:** prototipo académico independiente (arquitectura limpia, stack propio), **no** integración directa al sistema .NET de Lazaro. Si algún día se integrara, sería vía API/HTTP.

---

## 2. Decisiones de arquitectura ya tomadas

- **Stack:** Node.js 24 (LTS) · TypeScript · **NestJS 11** (backend) · **Prisma** (ORM) · **PostgreSQL** (base de datos) · **React 19 + Vite** (frontend) · **docker-compose** (Postgres local) · despliegue en **DigitalOcean** (más adelante).
- **Por qué este stack:** el equipo domina JS/TS, así que un solo lenguaje para los cinco. La "innovación" buscada es **arquitectónica** (pasar de escritorio local a web/API), no de lenguaje.
- **PostgreSQL es obligatorio** por la invariante de no-sobreventa (ver §4). No se reemplaza por otro motor.
- **Prisma con una salvedad:** no modela de forma nativa la restricción de exclusión ni los rangos de fecha, así que **esa restricción va en una migración SQL manual**. Alternativa SQL-first considerada: Drizzle.
- **Arquitectura:** para el **MVP** se usa la **estructura estándar de NestJS** (módulo → controlador → servicio → Prisma), **no** hexagonal completo todavía. El refactor a hexagonal (puertos y adaptadores) está planificado para la Fase 3, **antes** de las integraciones externas.
- **Las integraciones externas van detrás de puertos**: `IPasarelaDePagos` (Wompi), `IGestorDeCanales` (Channex/OTAs), `INotificador` (WhatsApp). Ninguna entra al dominio.
- **Orquestación con eventos de dominio en proceso** (EventEmitter de NestJS). Sin broker externo (sin Kafka/RabbitMQ): no hay volumen que lo justifique.

---

## 3. El dominio (DDD)

**Lenguaje ubicuo:** Habitación, Reserva, Estadía, Huésped, Tarifa, Temporada (alta/media/baja), Persona adicional, Check-in/Check-out, Folio (cuenta de la estadía), Cargo a la habitación, Estado de habitación (libre/ocupada/en limpieza).

**Core domain:** reservas y estadías con tarificación (el valor diferencial, lo que hoy no existe).
**Subdominios de soporte:** housekeeping, servicio a la habitación, turnos de empleados.
**Genérico:** pagos, facturación (ya resuelta por Lazaro vía proveedor DIAN), acceso.

**Agregado raíz: `Reserva` / `Estadía`.** Ciclo de vida: `Reservada → EstadíaActiva (check-in) → Cerrada/Liquidada (check-out)`.
- Entidades: `Huésped`, referencia a `Habitación`.
- Value objects: `RangoDeFechas`, `Tarifa`, `Dinero`, `TipoTemporada`, `NúmeroDePersonas`.
- `Folio`: acumula noches + cargos.

**Servicios de dominio:** `MotorDeTarificación` (calcula la tarifa) y `ServicioDeDisponibilidad` (hace cumplir la no-sobreventa).
**Eventos de dominio:** `ReservaConfirmada`, `HuéspedRegistrado` (check-in), `ConsumoCargadoAHabitación`, `EstadíaCerrada` (check-out).

**Integración clave con el POS existente:** un consumo del restaurante/bar se **postea al folio** de la estadía activa — ese es el "cargo a la habitación".

---

## 4. Las 4 invariantes (reglas que el dominio debe proteger)

1. **No sobreventa:** una habitación no puede tener dos reservas confirmadas que se solapen en fechas. **(La más importante.)**
2. La **tarifa** se calcula según temporada + tipo de habitación + personas adicionales.
3. Solo se pueden **cargar consumos** mientras la estadía está activa (post check-in, pre check-out).
4. El **check-out** cierra el folio y liquida la estadía (no admite más cargos).

### Cómo se implementa la no-sobreventa (crítico)

En **dos capas**:
1. **Verificación previa** en el servicio (para devolver un `409` limpio).
2. **Restricción en PostgreSQL** (la garantía real, atómica ante concurrencia). Va en una migración SQL manual:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "reserva"
  ADD CONSTRAINT reserva_sin_sobreventa
  EXCLUDE USING gist (
    habitacion_id WITH =,
    daterange(fecha_entrada, fecha_salida, '[)') WITH &&
  )
  WHERE (estado IN ('confirmada', 'activa'));
```

> **Ojo:** que Node sea de un solo hilo **no** evita la doble reserva (dos peticiones se intercalan en cada `await`). La garantía la da esta restricción. Al violarse, PostgreSQL lanza el error `23P01`; **captúralo y devuélvelo como `409 Conflict`**, no como 500.

---

## 5. Estado actual: el MVP

El alcance del MVP es **reservar una habitación por fechas sin sobreventa, de punta a punta**.

**Incluye:** gestión de habitaciones (crear/listar/estado) · reserva con no-sobreventa · disponibilidad por rango · check-in/check-out · **tarifa fija** (total = noches × tarifa).
**Excluye (por ahora):** tarifas por temporada/personas · OTAs/pagos/WhatsApp · cargos del POS · login/roles · despliegue en la nube.

### Modelo de datos del MVP (3 tablas, nombres en snake_case vía `@map`)

- **habitacion** — `id` (PK), `numero`, `tipo`, `tarifa_noche`, `estado` (`libre`/`ocupada`)
- **huesped** — `id` (PK), `nombre`, `documento`, `telefono?`
- **reserva** — `id` (PK), `habitacion_id` (FK), `huesped_id` (FK), `fecha_entrada`, `fecha_salida`, `estado` (`confirmada`/`activa`/`cerrada`/`cancelada`), `total?`, `created_at`

Relaciones: una **habitación** tiene muchas **reservas**; un **huésped** tiene muchas **reservas**. `reserva` es la tabla central con dos claves foráneas.

### Endpoints del MVP (REST)

- `GET /habitaciones` · `POST /habitaciones`
- `GET /habitaciones/disponibles?desde=&hasta=`
- `GET /reservas` · `POST /reservas` (rechaza solapamiento con 409)
- `POST /reservas/:id/check-in` · `POST /reservas/:id/check-out` (calcula total)

### Frontend del MVP (React + Vite)

Tres pantallas: **Tablero** de habitaciones · **Nueva reserva** (fechas → disponibles → huésped) · **Check-in/out**.

### Estructura de carpetas

```
mvp-hotel/
├── docker-compose.yml        # solo PostgreSQL
├── backend/                  # NestJS
│   ├── prisma/schema.prisma
│   ├── prisma/migrations/    # incluye la migración con la constraint
│   ├── prisma/seed.ts
│   └── src/{habitaciones, reservas, prisma}/
└── frontend/                 # React + Vite (pages, components, api)
```

---

## 6. Plan de expansión por fases

El orden se guía por **dependencia y riesgo**: lo barato y aislado primero; lo que toca infraestructura externa, al final. **Nunca construir la siguiente fase sobre una base sin pruebas.**

- **Fase 0 — Consolidar el MVP:** pruebas del caso de sobreventa y del cálculo del total; manejo de errores consistente; seed estable; **decidir las reglas finas** (hold temporal, cancelación, impuestos, pagos parciales).
- **Fase 1 — Tarifas reales:** `MotorDeTarificación` (temporada + personas adicionales + impuestos). Es dominio puro. **(decidir)** temporada como calendario fijo vs configurable → empezar por fijo.
- **Fase 2 — Folio / cargo a la habitación:** `Folio` que acumula noches + cargos; por ahora cargo **manual** (no la integración POS real). **(decidir)** si admite pagos parciales → por ahora, no.
- **Fase 3 — Refactor a hexagonal:** extraer el dominio puro y definir los puertos (`IPasarelaDePagos`, `INotificador`, `IGestorDeCanales`). Va **antes** de las integraciones. Trabajo invisible pero evita que las integraciones ensucien el dominio.
- **Fase 4 — Reserva web pública + autenticación:** frontend público de reserva; auth y roles (recepcionista/admin); **el receptor de webhooks hospedado y siempre encendido** se vuelve real aquí. **(decidir)** dónde vive y cómo sincroniza con la BD del cliente (modelo "una BD por cliente" de Lazaro).
- **Fase 5 — Integraciones externas (en orden):** (1) **Wompi** (pagos, cobra el anticipo; se confirma por webhook, no por la respuesta inmediata) → (2) **Channex** (OTAs, con capa anticorrupción) → (3) **WhatsApp** (confirmaciones). Las 4 reglas de webhook aplican a las tres: **idempotencia, verificar firma, responder rápido (ACK), validar el payload antes de tocar el dominio**.
- **Fase 6 — Robustez y despliegue:** pruebas de concurrencia reales; holds y cancelación; observabilidad; despliegue en DigitalOcean.

> El backlog detallado (33 ítems con prioridad, estimación, responsable y criterio de aceptación) existe como archivo aparte (`Backlog - Expansión del MVP.xlsx`).

---

## 7. Herramientas externas (para Fases 4–5)

Las tres se conectan por API y se pagan por uso. **(Confirmar precios/detalles en la documentación oficial antes de citar cifras.)**

- **Channex** — channel manager (API white-label). Conecta con Booking, Expedia, Airbnb y 400+ OTAs. Es la **capa anticorrupción** hacia las OTAs (traduce la reserva externa al modelo propio y emite `ReservaConfirmada`).
- **Wompi** — pasarela de pagos colombiana (Bancolombia). PSE, Nequi, transferencia, tarjeta. Cobra reserva/anticipo. El pago **se confirma con el webhook**, no con la respuesta inmediata.
- **WhatsApp Business API** (Meta Cloud API) — confirmaciones y recordatorios de check-in con plantillas.

**Direcciones:** Channex y Wompi son **bidireccionales** (entrada por webhook + salida por puerto); WhatsApp es casi solo **salida** en el alcance inicial. **Entrada = webhook → caso de uso; Salida = puerto que el dominio invoca.**

---

## 8. Convenciones y preferencias

- **Código limpio y comentado en español.** TypeScript en todo.
- Validar entradas en el borde con `class-validator` / Zod, **antes** de que toquen el dominio.
- Códigos HTTP correctos: 201 al crear, 409 en conflicto de reserva, 404 si no existe.
- Simplicidad sobre sofisticación (KISS): no adelantar funcionalidades de fases posteriores.

---

## 9. Decisiones abiertas (resolver cuando corresponda)

- **(decidir)** Política de cancelación y anticipos/depósitos.
- **(decidir)** Hold temporal: ¿una reserva `confirmada` sin pago expira y libera la habitación? (Afecta qué estados dispara la constraint.)
- **(decidir)** "Temporada": calendario fijo vs configurable por el cliente.
- **(decidir)** Impuestos por noche y si el folio admite pagos parciales.
- **(decidir)** Dónde vive el receptor de webhooks hospedado y cómo sincroniza con la instancia del cliente.

---

## 10. Cómo empezar en Claude Code

Si aún **no existe el código del MVP**: construir primero el MVP (§5) — backend con la migración de la constraint, luego frontend, con `docker-compose` para Postgres y un `seed` de ejemplo. Criterio de éxito: crear una reserva válida (201), que una solapada dé **409**, y check-in/out con cálculo del total.

Si el **MVP ya existe**: arrancar por la **Fase 0** (pruebas del núcleo + decidir reglas finas) antes de expandir.

En ambos casos: mantener el dominio probado en verde antes de avanzar, y las integraciones siempre detrás de puertos.
