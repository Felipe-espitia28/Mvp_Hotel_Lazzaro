# Reglas de negocio — Módulo hotelero (Lazaro Software)

> **Estado:** propuesta para validar con el empresario (ítem F0-5 del backlog).
> Los valores numéricos (horas, porcentajes, montos) son **valores por defecto
> configurables por cada hotel**, no reglas fijas. Lo marcado con ⚖️ debe
> validarse con un contador o asesor legal antes de usarse en producción.

## El problema que resuelve

Hoy Lazaro maneja un hotel como si fuera un restaurante: **una habitación es una
mesa**. Una mesa se ocupa y se libera en el momento; una habitación se
**compromete a futuro por un rango de fechas**, tiene un precio que depende de
la fecha y acumula consumos durante días. Por eso el hotel no puede hoy:

- saber qué habitaciones están libres para fechas futuras,
- evitar vender la misma habitación dos veces,
- cobrar distinto en temporada alta,
- cargar a la habitación lo que el huésped consume en el restaurante.

Las reglas de abajo definen cómo el módulo resuelve cada uno de esos puntos.

---

## 1. Reservas

| ID  | Regla                                                                                                                                                       | Por qué le importa al hotel                                                                                         | En el MVP hoy                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| R1  | **Nunca se vende una habitación dos veces** en fechas que se solapen. No hay sobreventa intencional.                                                        | Una sobreventa obliga a reubicar al huésped en otro hotel a costo propio y daña la reputación (reseñas en Booking). | ✅ Garantizado por la base de datos y probado con concurrencia.       |
| R2  | La noche se cuenta de la fecha de entrada a la de salida: el día de salida queda libre para otro huésped (entrada 10, salida 15 = 5 noches).                | Permite que una habitación se venda el mismo día que se desocupa.                                                   | ✅                                                                    |
| R3  | No se puede reservar con fecha de entrada en el pasado.                                                                                                     | Evita errores de digitación que bloquean habitaciones.                                                              | ✅                                                                    |
| R4  | Estadía mínima de 1 noche y máxima de **30 noches**; antelación máxima de **365 días**.                                                                     | Las estadías largas suelen negociarse aparte (tarifa mensual); reservas a años vista suelen ser errores.            | ✅                                                                    |
| R5  | **El precio se calcula y se congela al confirmar la reserva.** Si el hotel cambia sus tarifas después, las reservas existentes conservan el precio pactado. | Es lo que se le prometió al cliente.                                                                                | ✅ Se guarda como `valorAlojamiento`.                                 |
| R6  | La reserva registra **número de huéspedes**, que no puede superar la capacidad máxima del tipo de habitación.                                               | Base para cobrar personas adicionales (R12) y para no meter 4 personas en una sencilla.                             | ✅ Se registra; la disponibilidad excluye habitaciones sin capacidad. |
| R7  | Cambiar fechas o habitación = cancelar y crear una nueva reserva (sin penalidad si la hace el hotel).                                                       | Mantiene simple el MVP; la modificación directa queda para después.                                                 | —                                                                     |

## 2. Cancelación y no-show

| ID  | Regla                                                                                                                                                                                                           | Por qué                                                                                                                        | En el MVP hoy                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| R8  | Solo se cancela una reserva **confirmada** (antes del check-in). Una estadía activa no se cancela: se cierra con check-out.                                                                                     | Una vez el huésped está en la habitación ya hay consumo real.                                                                  | ✅                               |
| R9  | Cancelación **gratuita hasta 48 h antes** de la fecha de entrada. Después, penalidad de **1 noche**.                                                                                                            | Es la política más común en hoteles pequeños y en Booking; protege al hotel de cancelaciones tardías que ya no puede revender. | ✅                               |
| R10 | **No-show:** si el huésped no hace check-in antes de la hora de check-out del día siguiente a su entrada, la reserva pasa a `no_show`, se cobra **1 noche** de penalidad y **se liberan las noches restantes**. | Sin esta regla, una reserva fantasma bloquearía la habitación todas sus noches (y la regla R1 impediría venderla).             | ✅ Tarea programada cada 10 min. |
| R11 | Al cancelar o marcar no-show, las fechas quedan **disponibles de inmediato**.                                                                                                                                   | Recuperar ingresos revendiendo la habitación.                                                                                  | ✅                               |

> Mientras no haya pagos en línea, la penalidad se **registra como monto a
> cobrar**; no se cobra automáticamente.

## 3. Tarifas

| ID  | Regla                                                                                                                                                                                                                                                 | Por qué                                                                                            | En el MVP hoy                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| R12 | La tarifa base se define **por tipo de habitación** (sencilla, doble, suite), con una **capacidad incluida** y una **capacidad máxima**. Cada persona adicional sobre la incluida paga un **cargo fijo por noche**.                                   | Así publican los precios los hoteles; cambiar el precio de "todas las dobles" es una sola edición. | ✅ Tipos editables por el admin en la pestaña Tarifas.                                                    |
| R13 | El año se divide en temporadas **alta / media / baja**, cada una con un **multiplicador** sobre la tarifa base (por defecto: baja ×1,00 · media ×1,15 · alta ×1,30).                                                                                  | Es el principal reclamo actual: no se puede cobrar más en temporada alta.                          | ✅                                                                                                        |
| R14 | **Cada noche se cobra según su propia temporada.** Una estadía del 13 al 17 de diciembre cobra noches en media y en alta.                                                                                                                             | Es la forma justa y la que el huésped puede verificar en el desglose.                              | ✅ Desglose noche por noche, congelado en la reserva.                                                     |
| R15 | Calendario inicial **fijo** definido por el hotel por año. Sugerido para Colombia: alta = 15 dic–15 ene, Semana Santa y 15 jun–15 jul; media = puentes festivos; baja = el resto. Semana Santa cambia cada año, por eso el calendario es **por año**. | Cubre los picos de turismo nacional; más adelante cada hotel lo configura.                         | ✅ Calculado: Pascua y festivos de Colombia (Ley Emiliani) para cualquier año.                            |
| R16 | ⚖️ **IVA del 19 %** sobre el alojamiento, configurable por hotel. Los turistas **extranjeros no residentes** pueden estar exentos: se registra la nacionalidad del huésped para aplicarlo.                                                            | Cumplimiento tributario; la factura electrónica la sigue emitiendo Lazaro con su proveedor DIAN.   | ✅ 19 %. ⚖️ Exento en el MVP: quien se registra con pasaporte (aproximación a "extranjero no residente"). |
| R17 | El total siempre se muestra **desglosado**: noches × tarifa por temporada, personas adicionales, impuestos y cargos.                                                                                                                                  | El recepcionista debe poder explicarle el cobro al huésped.                                        | ✅ En la nueva reserva y en el detalle de cada reserva (cargos del folio: bloque C).                      |

## 4. Estadía: check-in, folio y check-out

| ID  | Regla                                                                                                                                                                                                                                                                                    | Por qué                                                                                                                                                                                                 | En el MVP hoy                                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R18 | Horarios por defecto: **check-in desde las 15:00, check-out hasta las 12:00** (configurables). Se puede hacer check-in desde la fecha de entrada.                                                                                                                                        | Da tiempo de limpieza entre huéspedes.                                                                                                                                                                  | 🟡 Valida la fecha de llegada; los horarios aún no se configuran.                                                                                         |
| R19 | ⚖️ En el check-in se completan los datos del huésped (tipo y número de documento, nacionalidad, procedencia).                                                                                                                                                                            | Colombia exige registrar a los huéspedes (Tarjeta de Registro Hotelero y, para extranjeros, reporte a Migración). La integración con esos sistemas queda para después; el módulo deja los datos listos. | ✅ El check-in exige nacionalidad, procedencia y motivo; "Registro hotelero" del día con los extranjeros marcados. Envío a TRA / Migración: hoja de ruta. |
| R20 | Al hacer check-in se abre el **folio**: la cuenta de la estadía, que arranca con las noches.                                                                                                                                                                                             | Una sola cuenta por estadía.                                                                                                                                                                            | ✅ Folio en el detalle de la reserva: alojamiento + consumos.                                                                                             |
| R21 | **Solo se cargan consumos al folio mientras la estadía está activa** (después del check-in y antes del check-out).                                                                                                                                                                       | Evita cargos a reservas que aún no llegan o que ya pagaron.                                                                                                                                             | ✅ Seguro ante concurrencia: un cargo y el check-out simultáneos se ordenan (bloqueo de la reserva).                                                      |
| R22 | Los cargos pueden venir de recepción (manuales: lavandería, late check-out, minibar) o del restaurante/bar de Lazaro ("cargar a la habitación"). En el MVP, solo manuales.                                                                                                               | Es la integración clave con lo que Lazaro ya tiene.                                                                                                                                                     | 🟡 Manuales (minibar, lavandería, restaurante, late check-out); se anulan, no se borran. ⚖️ Valor final con impuestos. POS: hoja de ruta.                 |
| R23 | **El check-out liquida y cierra el folio**: total = noches + personas adicionales + impuestos + cargos − anticipo. Después del cierre no se admiten más cargos. Se paga completo en ese momento (sin pagos parciales) y se registra el medio de pago (efectivo, tarjeta, transferencia). | Cierre de caja claro; la factura sale de ese total.                                                                                                                                                     | ✅ Liquidación = alojamiento + consumos, con medio de pago (sin anticipo: aún no hay pagos en línea).                                                     |
| R24 | Salida anticipada: se cobran las **noches realmente usadas** y se liberan las restantes.                                                                                                                                                                                                 | Política amable y simple; se puede cambiar a "se cobra todo" si el hotel lo prefiere.                                                                                                                   | ✅ Del desglose pactado (temporada, adicionales, IVA); mínimo 1 noche; la salida se adelanta y lo pactado queda en la auditoría.                          |

## 5. Habitaciones

| ID  | Regla                                                                                                            | Por qué                                                        | En el MVP hoy                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| R25 | Estados: **libre → ocupada** (check-in) **→ en limpieza** (check-out) **→ libre** (housekeeping la marca lista). | No se debe entregar una habitación sucia al siguiente huésped. | ✅ El check-in exige la habitación lista; recepción la marca lista desde Habitaciones.                        |
| R26 | Una habitación **fuera de servicio** (mantenimiento) no aparece como disponible.                                 | Evita vender una habitación dañada.                            | ✅ Tampoco admite reservas nuevas; al sacarla de servicio se avisa cuántas reservas futuras hay que reubicar. |

## 6. Pagos y anticipos (fase posterior, con Wompi)

| ID  | Regla                                                                                                                                                                                                        | Por qué                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| R27 | Las reservas **hechas por recepción** se confirman de inmediato, sin anticipo (el hotel conoce al cliente o cobra en sitio).                                                                                 | Así trabajan hoy.                              |
| R28 | Las reservas **web** exigen un **anticipo del 30 %** (o la primera noche). Mientras no se pague, la reserva queda `pendiente` y bloquea la habitación por **30 minutos**; si no se paga, expira y se libera. | Evita reservas falsas que bloquean inventario. |
| R29 | El pago se considera hecho **solo cuando llega la confirmación de la pasarela** (webhook), nunca por lo que diga el navegador del huésped.                                                                   | Seguridad: el navegador se puede manipular.    |

---

## 7. Usuarios y acceso

| ID  | Regla                                                                                                                                                                  | Por qué                                                                                               | En el MVP hoy                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| R30 | Nadie usa el sistema sin iniciar sesión con su propio usuario.                                                                                                         | Cada acción queda atribuible a una persona; un computador de recepción no queda abierto a cualquiera. | ✅                                                                         |
| R31 | Dos roles: **recepcionista** (opera reservas, check-in/out, cancelaciones, no-shows) y **administrador** (además crea habitaciones y gestiona usuarios).               | Recepción no debe poder cambiar el inventario ni dar accesos.                                         | ✅                                                                         |
| R32 | Al desactivar a un empleado (p. ej. cuando deja el hotel) pierde el acceso **de inmediato**, aunque tenga la sesión abierta. No se borra, para conservar el historial. | Seguridad ante rotación de personal.                                                                  | ✅                                                                         |
| R33 | Un administrador no puede desactivarse ni quitarse el rol a sí mismo.                                                                                                  | El hotel nunca se queda sin alguien que gestione el sistema.                                          | ✅                                                                         |
| R34 | Registrar qué usuario creó, canceló o hizo check-in/out de cada reserva.                                                                                               | Auditoría y resolución de disputas con huéspedes.                                                     | ✅ Historial por reserva; los no-shows automáticos figuran como "Sistema". |

## 8. Huéspedes

| ID  | Regla                                                                                                                                                                                                  | Por qué                                                                               | En el MVP hoy |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------- |
| R35 | Un huésped se identifica por **tipo + número de documento** (CC, CE, pasaporte, TI, PPT). Si vuelve, se reutiliza su registro: no se duplica. El número se normaliza (`1.020.304.050` = `1020304050`). | Historial del cliente, clientes frecuentes y datos limpios para el registro hotelero. | ✅            |
| R36 | Al reconocer a un cliente se **conserva su nombre registrado**; el teléfono sí se actualiza.                                                                                                           | Un error al digitar el documento no le cambia el nombre a otra persona.               | ✅            |

## Ciclo de vida de una reserva (con estas reglas)

```
                ┌──────────── cancelar (R8, R9) ────────────► cancelada
                │
 [web] pendiente ──pago──► confirmada ──check-in──► activa ──check-out──► cerrada
        │                    │                     (folio abierto)  (folio liquidado)
        └─expira (R28)       └─ no llega (R10) ──► no_show
```

## Decisiones que debe validar el empresario

1. ¿La política de cancelación de 48 h con penalidad de 1 noche le sirve, o cada hotel debe definir la suya?
2. ¿Los multiplicadores de temporada (×1,15 / ×1,30) son razonables, o sus hoteles manejan tarifas por temporada como precios fijos?
3. Salida anticipada: ¿se cobran las noches usadas o todas las reservadas?
4. ¿Qué porcentaje de anticipo exigen hoy sus clientes, si exigen alguno?
5. ⚖️ IVA y exención para extranjeros: confirmar con el contador cómo lo factura hoy Lazaro.
