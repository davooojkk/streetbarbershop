# Errores de Street Barbershop — causas y soluciones

Guía para el barbero y para quien mantenga la web. Cada error dice
**dónde sale**, **por qué pasa** y **qué hacer**. Los mensajes están
copiados tal cual aparecen en pantalla.

> Cómo ver el motivo técnico: apretá `F12` → pestaña `Console`,
> repetí la acción y copiá el texto rojo. Si el cartel trae un
> `(CÓDIGO)` entre paréntesis, buscalo abajo en la sección 4.

---

## 1. Agenda (`agenda.html`)

| Mensaje | Causa | Solución |
|---|---|---|
| Ya tenés un turno activo. Podés cambiarlo o cancelarlo desde el panel superior. | Regla de 1 turno por persona. Ya hay un turno vigente en este celu. | Usar CAMBIAR TURNO o CANCELAR TURNO del panel superior. |
| Ese horario ya no está disponible. Elegí otro turno. | El slot se ocupó (otro celu) o pasó su hora mientras elegías. | Elegir otro horario. La cartelera se redibuja sola. |
| Revisá los campos marcados antes de solicitar el turno. | El navegador marcó nombre o teléfono inválidos. | Corregir los campos en rojo y reintentar. |
| Ingresá tu nombre y apellido, y un celular uruguayo que comience con 09. | Falta el apellido, o nombre fuera de 2–60 letras, o teléfono que no es `09 + 7 números`. | Escribir nombre y apellido reales más celular `091234567`. |
| No pudimos cancelar. Revisá tu conexión e intentá de nuevo. | Falló `cancelar_con_token` (red, sesión caída o turno ya cambiado). | Reintentar; si sigue, recargar con `Ctrl + F5`. |
| Sin conexión a la nube / No pudimos confirmar los horarios. | Falta URL/KEY, no hay internet o falló una consulta. Los botones quedan bloqueados para no mostrar como libre algo desconocido. | Revisar configuración y conexión; después recargar. |
| No pude guardar (`CÓDIGO`). Revisá tu conexión e intentá de nuevo. | La nube rechazó el guardado. El `CÓDIGO` dice cuál (ver sección 4). | Buscar el `CÓDIGO` abajo. Si dice red, revisar conexión. |
| La base todavía no tiene todas las migraciones. | Falta una RPC o Supabase no encuentra `pgcrypto.digest` (`42883`/`PGRST202`). | Aplicar, en orden, las migraciones pendientes; para el fallo actual ejecutar primero `0003_reparar_pgcrypto.sql`. |
| Elegí un nuevo horario… / Cancelaste el cambio… | Avisos informativos del modo CAMBIAR TURNO, no son errores. | Seguir eligiendo o cerrar el modo. |

Mensajes de éxito (para reconocerlos): `¡Turno solicitado!`, `¡Turno cambiado!`,
`El horario … quedó reservado.`, `Cancelaste el turno del …`.

## 2. Dashboard (`dashboard.html`)

| Mensaje | Causa | Solución |
|---|---|---|
| Cargando turnos… | Está pidiendo datos. Si queda fijo, la petición se colgó. | Esperar 10 s; si no avanza, recargar. |
| `N turno(s) el AAAA-MM-DD.` | Confirmación de lectura, no es error. | Ninguna. |
| Ese cambio de estado no está permitido. | Transición ilegal (ej: `cancelado → confirmado`). La base la rechaza. | Solo vale: `pendiente → confirmado/cancelado`, `confirmado → atendido/cancelado`. |
| No se pudo cambiar el estado. | Red caída o sesión vencida. | Recargar, re-entrar si pide login. |
| Tu usuario no es barbero. Pedí acceso e intentá de nuevo. | Entraste con un usuario que no está en la tabla `barberos`. | El dueño corre `insert into public.barberos (user_id) values ('TU-UID');` |
| No pude leer. Revisá conexión y sesión. | Red, proyecto pausado o sesión vencida. | Recargar; si pide login, entrar de nuevo. |
| No pude conectar con la nube. Revisá `js/supabase-client.js` y tu conexión. | CDN bloqueado, URL/KEY mal o sin internet. | Revisar archivo, conexión y `F12` → `Console`. |
| Sin turnos este día… / Sin cancelaciones… | La fecha no tiene filas. Normal si mirás otro día. | Cambiar la fecha al día del turno. |

## 3. Login y validación

| Mensaje | Causa | Solución |
|---|---|---|
| No pude entrar. Revisá email y contraseña. (`login.html`) | Credenciales mal o usuario inexistente en `Authentication`. | Verificar email/clave; crear el usuario en Supabase. |
| No pude conectar con la nube. Revisá tu conexión. (`login.html`) | CDN o red caída. | Revisar conexión y recargar. |
| Ingresá tu nombre y apellido (dos palabras, solo letras). | Falta el apellido, o hay números/símbolos, o largo fuera de 2–60. | Ej: `Juan Pérez`. Solo letras, espacios, `'` y `-`. |
| Ingresá un celular uruguayo de 9 dígitos que comience con 09. | Teléfono con otro formato. | Formato `091234567`. |

## 4. Códigos de la base (salen entre paréntesis o en `Console`)

| Código | Dónde sale | Causa | Solución |
|---|---|---|---|
| `SLOT_OCUPADO` | Agenda | Otro reservó ese slot primero (la base es la autoridad). | Elegir otro horario. |
| `TOPE_POR_TELEFONO` | Agenda | Ese teléfono ya tiene 3 turnos activos. | Cancelar uno antes (antifraude demo). |
| `DOMINGO_CERRADO` | Agenda, disponibilidad | Se pidió un domingo. | Elegir otro día. |
| `FECHA_PASADA` | Agenda | Slot anterior a ahora (hora Uruguay). | Elegir futuro. |
| `SLOT_NO_HABILITADO` | Agenda | Hora fuera de 08:00–17:00 en punto. | Elegir hora de la grilla. |
| `FUERA_DE_VENTANA` | Agenda | Fecha a más de 65 días. | La agenda solo muestra 5 días; no forzar fechas. |
| `PAYLOAD_INVALIDO` | Agenda | Nombre sin apellido, largo inválido o teléfono mal (aunque pase el JS). | Corregir datos. Desde la migración `0002`, el apellido es obligatorio también en base (`nombre_apellido`). |
| `IDEMPOTENCY_KEY_REUSED` | Agenda | Mismo `request_id` con distinto contenido (reintento corrupto o bug). | Recargar y hacer el pedido de nuevo (nuevo `request_id`). |
| `TOKEN_INVALIDO_O_ESTADO_FINAL` | Agenda | Token mal o turno ya cancelado/atendido. | Recargar; si cancelaste, pedir turno nuevo. |
| `RESERVA_INEXISTENTE` | Agenda, dashboard | El id ya no existe (borrado manual en panel). | No borrar filas a mano; recargar. |
| `SLOT_IGUAL` | Agenda (cambio) | Cambio al mismo slot actual. | Elegir otro horario o cerrar el modo cambio. |
| `TOKEN_INVALIDO` | Agenda/home | El turno local no existe o su token no coincide. | La web elimina la copia obsoleta; elegir un turno nuevo si corresponde. |
| `CONFIGURACION_BACKEND` | Agenda | Falta una función/migración o el caché de PostgREST aún no la ve. | Aplicar `0003` y `0004`, esperar hasta 2 min y recargar. |
| `SOLO_BARBERO` | Dashboard | Usuario sin fila en `barberos`. | Insertar su UID en `public.barberos`. |
| `TRANSICION_INVALIDA` | Dashboard | Cambio de estado no permitido. | Respetar la máquina: `pendiente → confirmado/cancelado`, `confirmado → atendido/cancelado`. |
| `TOPE_POR_TELEFONO` | Gate/tests | Límite antifraude en pruebas. | Usar otro teléfono de prueba. |

## 5. Infraestructura (Supabase / red)

| Síntoma | Causa | Solución |
|---|---|---|
| `Could not find the function … in the schema cache` | Migración no corrida o recién corrida (caché PostgREST tarda 1–2 min). | Correr `supabase/migrations/0001_modelo_seguro.sql` en SQL Editor; esperar 2 min; `Ctrl + F5`. |
| `function digest(text, unknown) does not exist` (`42883`) | `crear_reserva`, cancelar o cambiar desde GitHub Pages. `pgcrypto` está en `extensions`, pero las RPC antiguas tenían `search_path` vacío. | Ejecutar `supabase/migrations/0003_reparar_pgcrypto.sql`. Esta fue la causa reproducida del fallo de reservas publicado. |
| `permission denied / 401 / 42501` | RLS o falta de `GRANT` (anon tocando tabla o RPC de barbero). | No llamar la tabla directo; usar RPC. Si es barbero, revisar `barberos` y sesión. |
| `Failed to fetch` / red en `Console` | Sin internet, proyecto pausado o URL mal (ej: con `/rest/v1` de más). | URL solo `https://xxx.supabase.co`; revisar pausa en el panel. |
| Proyecto pausado (panel Supabase) | Plan free sin uso 1 semana. | `Unpause`; a producción paga para evitarlo. |
| `favicon.ico 404` en consola | No hay ícono. Cosmético, no rompe nada. | Agregar `favicon` cuando se quiera. |

## 6. Migración `0002` (apellido obligatorio)

Antes de correr `supabase/migrations/0002_apellido_obligatorio.sql`, listar
filas viejas de una sola palabra (el `ALTER` las rechazaría):

```sql
select id, nombre, telefono from public.reservas
where nombre !~ '[^[:space:]]+[[:space:]]+[^[:space:]]+';
```

Si sale vacía, correr el archivo. Si hay filas: pedir el apellido al
cliente o cancelarlas desde el dashboard, y recién después migrar.

Después aplicar `0003_reparar_pgcrypto.sql` y
`0004_integridad_reintentos.sql`, en ese orden.

## 7. Regla para agregar errores nuevos

1. Todo error visible lleva causa y solución en este archivo.
2. Los códigos de base van en MAYÚSCULAS y se muestran entre paréntesis.
3. Nunca mostrar PII (nombres, teléfonos) ni secretos en el mensaje.
4. Probar el mensaje provocando el error de verdad antes de darlo por listo.
