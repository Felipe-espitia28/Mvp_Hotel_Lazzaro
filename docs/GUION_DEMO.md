# Guion de la demo (~18 minutos)

Audiencia: el empresario (Lazaro Software), el ingeniero y el profesor. Idea
central: **resolvemos un problema real del negocio, y cada regla crítica está
garantizada y probada.**

## Antes de empezar (5 minutos antes)

1. Levantar la app:
   - Con Docker (recomendado): `docker compose --profile demo up -d --build`
     → `http://localhost:8080`.
   - En modo desarrollo: Postgres + `npm run start:dev` + `npm run dev` →
     `http://localhost:5173`.
2. **Reiniciar los datos de la demo** (fechas relativas a hoy):
   - Docker: `docker compose --profile demo run --rm backend node dist/prisma/seed.js`
   - Desarrollo: `cd backend && npm run seed`
3. Tener a mano las credenciales (`backend/.env.example`): Consola Lazaro,
   y administración y recepción de cada hotel. Abrir
   `http://localhost:3000/docs` en otra pestaña.
4. Mirar en **Gerencia del hotel → Temporadas** de Hotel Andino cuál es el
   próximo **puente festivo** para usarlo en el paso 4.

El seed deja **dos hoteles** con identidades distintas:

| Hotel        | Ingreso con su marca   | Marca                         | Reglas                                                                 |
| ------------ | ---------------------- | ----------------------------- | ---------------------------------------------------------------------- |
| Hotel Andino | `/?hotel=hotel-andino` | Azul noche y dorado, Playfair | Por defecto: cancela gratis 48 h, 1 noche de penalidad                 |
| Sol Caribe   | `/?hotel=sol-caribe`   | Turquesa y coral, Montserrat  | 24 h y 2 noches, check-in 2 p. m., temporada de playa, precios mayores |

Escenarios de **Hotel Andino** (el recorrido principal):

| Habitación | Huésped         | Situación                                                    |
| ---------- | --------------- | ------------------------------------------------------------ |
| 101        | Carlos Gómez    | Alojado, con 3 consumos y un abono → para hacer check-out    |
| 201        | Ana Martínez    | Llega hoy, 3 huéspedes (1 persona adicional) → para check-in |
| 202        | Luis Herrera    | Llega mañana; la habitación está **en limpieza**             |
| 301        | Sofía Ramírez   | Llega en 10 días, con anticipo → cancelación gratuita        |
| 102        | Pedro Castillo  | Nunca llegó → el sistema lo marca como no-show               |
| 302        | Valentina Ortiz | Estadía cerrada (alojamiento + desayunos, pagó con tarjeta)  |
| 302        | Jorge Peña      | Cancelación tardía con penalidad                             |

Escenarios de **Sol Caribe**: Emily Johnson (alojada, extranjera: aparece
para Migración), la Familia Rodríguez (llega hoy a la suite: 2 adultos y niños de 3 y 8 años), Julián Torres
(en 5 días) y Laura Gómez (estadía cerrada, pagó por transferencia).

## El recorrido

### 1. El problema (1 min, sin pantalla)

"Hoy Lazaro trata la habitación como una mesa. Pero una habitación se vende
**a futuro, por fechas**, cambia de precio en temporada alta y acumula
consumos durante días. Eso hoy no existe. Este módulo lo resuelve."

### 2. El día del recepcionista (2 min) — entrar como **recepción**

- **Panel Hoy**: ocupación de esta noche, llegadas (Ana), salidas, habitaciones
  **por limpiar** e ingresos del mes desglosados. El gráfico muestra la
  ocupación de las próximas 14 noches (pasar el mouse por una barra da el
  detalle). Abajo, los **saldos por cobrar** de los que salen hoy y los
  **anticipos pendientes** de las llegadas de la semana.
- **Habitaciones** → la 202 está _en limpieza_ → **Marcar lista**. "Nadie le
  entrega a un huésped una habitación sucia: el sistema no deja hacer el
  check-in hasta que esté lista."
- Volver al panel y hacer el **check-in de Ana**: el sistema pide una
  tarjeta **por cada ocupante** (Ana y sus 2 acompañantes) con los datos que
  exige la TRA: documento, nombres y apellidos separados, fecha de
  nacimiento, nacionalidad, residencia y procedencia ("igual que el titular"
  los copia en un clic), y la aceptación de la política de datos. Si se elige
  un país extranjero, avisa que también se reporta a Migración. En
  **Huéspedes → Registro hotelero** queda una fila por persona, lista para
  reportar.
- **Huéspedes → Reportes legales**: el rango del mes, con las pestañas **TRA**
  (todos los huéspedes, con el código DIVIPOLA de las ciudades de Colombia) y
  **SIRE** (los extranjeros, una entrada y una salida). "Descargar CSV" baja
  el archivo para subirlo a la plataforma oficial; arriba aparecen las
  estadías con **datos por completar**, con un botón para abrir la reserva.
- Opcional: abrir el **check-out de Ana** recién llegada → "salida anticipada:
  se cobra 1 de 3 noches" (no confirmar).

### 3. El calendario (1 min)

- Sección **Calendario**: habitaciones × días, barras por estado. "El día de
  salida queda libre para otro huésped."
- **Arrastrar** la barra de una reserva confirmada dos días a la derecha (o a
  otra habitación): se abre el cambio con la **diferencia de precio** en
  grande; las noches que se conservan mantienen su tarifa. Confirmar. Si el
  hueco está ocupado, el sistema lo dice y no cambia nada.

### 4. Una reserva con tarifa real (3 min)

- **Nueva reserva** con fechas que crucen el próximo **puente festivo**, 3
  huéspedes.
- Mostrar que las sencillas no aparecen (no caben 3) y el **desglose**: noches
  en temporada media por el puente, noches en baja, persona adicional, IVA.
- Cambiar el documento a **pasaporte** → el IVA queda exento al instante.
- Escribir un documento de un cliente que ya vino (p. ej. `1.020.304.050`, de
  Carlos) → "Cliente registrado": no se duplica.
- Confirmar. "El precio queda **garantizado**: si mañana el hotel sube las
  tarifas, esta reserva no cambia."

### 5. La regla más importante: no vender dos veces (2 min)

- Intentar reservar **la misma habitación** en fechas que se solapen → el
  sistema lo rechaza.
- Para el ingeniero: "La garantía no es un `if` en el código: es una
  restricción de PostgreSQL. Lo comprobamos: sin ella, 10 reservas simultáneas
  vendían la habitación 10 veces; con ella, solo una gana. Está en las pruebas
  automáticas."

### 6. Folio y check-out (2 min)

- **Reservas** → Carlos → **Detalle**: folio con sus consumos. Cargar uno nuevo
  (p. ej. late check-out) y **anular** otro con motivo ("no se borra: queda en
  la auditoría").
- En el mismo folio, el **saldo** arriba (rojo: debe) y el abono que Carlos
  hizo al llegar. **Registrar abono** de $50.000 con tarjeta: el saldo baja.
- **Check-out** → liquidación: alojamiento + consumos − abonos = lo que falta.
  "Pagar con otro medio": una parte en efectivo y **el resto** con tarjeta; el
  botón se habilita cuando el saldo queda en $0. La 101 pasa a _en limpieza_.
- **Gerencia → Cuentas por cobrar**: la penalidad de Jorge Peña, pendiente;
  "Registrar abono" la saca de la lista.
- **Agenda** → Citas del día: columnas Cabina 1 y Terapeuta Ana. Clic en un
  hueco libre → **Masaje relajante** para Carlos (huésped alojado): "entra al
  folio cuando se presta". Intentar otro masaje en la misma cabina 30 minutos
  después: el sistema lo rechaza ("la cabina queda libre después de la
  limpieza"). Abrir la cita → **Marcar realizada**: el masaje aparece en su
  folio.
- **Agenda** → Salidas y cupos: el Tour en lancha del sábado con sus cupos
  libres; **Tomar cupo** para un cliente externo de 2 personas, que paga en el
  momento.

### 7. Cancelaciones y no-shows (1 min)

- **Revisar no-shows** → Pedro: no llegó, se cobra una noche y sus noches
  quedan libres para vender. Si el backend lleva más de 10 minutos encendido,
  la tarea automática ya lo habrá marcado (el botón dirá "No hay reservas
  vencidas"): mostrarlo en la lista como _No-show_ y su historial, donde
  figura como acción del "Sistema".
- **Sofía** pagó un **anticipo** al reservar (su folio lo muestra junto al
  anticipo sugerido, el 30 % del total). Cancelarla: es gratis (faltan más de
  48 h), así que el resumen dice "Penalidad $0 · anticipo $200.000 · a
  devolver $200.000"; en su folio, **Registrar reembolso**. Mostrar a
  **Jorge** (tardía, con penalidad por cobrar).

### 8. Control: auditoría y Gerencia del hotel (2 min) — entrar como **admin**

- **Detalle** de cualquier reserva → historial: quién hizo qué y cuándo.
- **Hoy → pestaña Gerencia** (solo el admin): "¿cómo va el negocio?".
  Ocupación, **ADR** (tarifa media) y **RevPAR** (ingreso por habitación
  disponible) de este mes, con la flecha frente al mes anterior; cambiar el
  período a "Mes anterior" o uno personalizado. La serie diaria (el ingreso
  de cada noche en el tooltip), el **pronóstico** de 30 días, los ingresos
  por clasificación, el **pickup** de la semana y las cuentas por cobrar con
  el enlace a cada reserva. "Los ingresos van por noche y sin IVA: la noche
  del 31 cuenta en su mes."
- **Gerencia del hotel**, el panel del administrador:
  - **Equipo**: crear y desactivar a un empleado ("pierde el acceso al instante, aunque tenga la sesión abierta").
  - **Precios y habitaciones**: subir la tarifa de las dobles en una sola edición.
  - **Servicios**: la categoría **Experiencias** con su campo propio "Nivel de
    dificultad"; abrir **Tour en lancha** (por edad: adulto y niño). Crear una
    categoría "Masajes" (clasificación Spa) y arrastrarla al primer lugar.
    Con **Spa** elegida, **Plantilla** → abrirla en Excel, agregar tres
    masajes (precios como `85.000`) y una fila con un error → **Importar**:
    la vista previa marca la fila y la columna y no deja importar; al
    corregirla, "3 nuevos" en una sola operación.
    En el folio de una estadía activa, elegir el tour: precarga a los
    ocupantes y el niño menor de 5 años no paga.
- **Habitaciones → Crear rango** "401 a 410, doble" (ve la vista previa
  "Se crearán 10"), o **Importar** la plantilla en Excel con una fila mala:
  la vista previa marca el error y no deja importar ("todo o nada"). Luego
  **Seleccionar → Las del piso 4 → Fuera de servicio**: un solo aviso con las
  reservas por reubicar.
  - **Políticas**: el resumen en lenguaje claro de cómo funciona el hotel.

### 9. Vender la plataforma a otro hotel (3 min) — entrar a la **Consola Lazaro**

- "Esto no es un sistema para un hotel: es una plataforma que Lazaro vende a
  muchos." La Consola muestra los hoteles clientes con sus indicadores.
- **Nuevo hotel** en vivo (p. ej. "Posada del Café", Salento):
  1. Datos.
  2. Marca, con vista previa.
  3. Personas con acceso.

  "Nace listo: con tipos de habitación, temporadas, catálogo y políticas sugeridas."

- Abrir el ingreso de **Sol Caribe** (`/?hotel=sol-caribe`): otro logo, otros
  colores, otras tipografías. Entrar como su administrador.
- **Gerencia → Marca**: cambiar el color de acento y ver toda la app
  cambiar en vivo.
- **Gerencia → Políticas y Temporadas**: Sol Caribe cancela gratis solo
  hasta 24 h antes y tiene su "Temporada de playa".
- **Reservas → la de la familia Rodríguez → Precio pactado**: el niño de 3
  años no paga y el de 8 paga la tarifa de niño ("0–4 gratis · 5–11 tarifa
  de niño · 12+ adulto", en Gerencia → Políticas). Al reservar se declara la
  edad de cada niño.
- **Check-in de la familia Rodríguez** (suite 31, 4 huéspedes): Diana, su
  esposo y sus dos hijos. Al poner la fecha de nacimiento de un niño, la
  tarjeta pide su **adulto responsable** y el **parentesco**; con un tercero
  autorizado, la casilla "Verifiqué la autorización de los padres" ("un menor
  no se aloja sin un adulto responsable, Ley 1336 de 2009"). Enviar con un
  dato vacío: el sistema lo **marca en su campo**, en la tarjeta de esa
  persona, y no hace el check-in.
- **Gerencia → Datos personales**: la política de tratamiento de datos
  (Ley 1581) con su versión. Publicar una nueva: "las aceptaciones anteriores
  quedan con su versión; los huéspedes aceptan la nueva en su próximo
  check-in".
- Cerrar con el aislamiento: "Recepción de Sol Caribe nunca ve los
  huéspedes ni las reservas de Hotel Andino, aunque comparten la plataforma.
  Está probado en cada recurso."
- Opcional: **suspender** un hotel desde la Consola → su equipo ya no puede
  entrar.

### 10. Cierre (1 min)

### 9. Cierre (1 min)

- Mostrar `docs/ARQUITECTURA.md`: las invariantes y dónde se protegen, y la
  hoja de ruta con puertos (POS de Lazaro → folio, Wompi, Booking vía
  Channex, WhatsApp).
- "246 pruebas automáticas, documentación de la API en `/docs`, y la demo se
  levanta con un solo comando."

## Preguntas probables

- **¿Qué pasa si dos recepcionistas reservan la misma habitación a la vez?**
  Solo una reserva se crea: lo garantiza PostgreSQL, no el código. Lo mismo
  aplica a dos check-in simultáneos y a un consumo cargado durante el
  check-out.
- **¿Cómo se integra con Lazaro (.NET)?** Por la API HTTP (documentada en
  `/docs`). Las integraciones van detrás de puertos: el POS de Lazaro sería un
  adaptador que carga consumos al folio.
- **¿Por qué no otra base de datos?** La restricción de exclusión sobre
  rangos de fechas es la garantía contra la sobreventa.
- **¿Y si el hotel cambia las tarifas?** Aplica a las reservas nuevas; las
  existentes conservan el precio pactado (queda congelado en la reserva).
- **¿Qué falta?** Pagos y reserva web, Booking, WhatsApp, POS automático,
  integración directa con la TRA y Migración (hoy el registro queda listo para
  reportar), multi-hotel y despliegue. Están en la hoja de ruta.
- **¿Y si el huésped se va antes?** Se cobran solo las noches usadas, con su
  temporada, y las restantes quedan libres para vender (lo pactado queda en la
  auditoría).
- **¿El IVA es correcto?** Está parametrizado (19 %) y la exención para
  extranjeros no residentes se aproxima por el pasaporte: queda por validar
  con el contador de Lazaro.

## Plan B

- Si algo falla en vivo, volver a correr el seed y recargar.
- Si el puerto 3000 está ocupado, apagar el backend de desarrollo antes de
  levantar Docker (o al revés).
