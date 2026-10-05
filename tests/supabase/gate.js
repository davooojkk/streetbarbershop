// ============================================================
// GATE de merge: 8 grupos que rompen el build si la seguridad cae.
// Sin dependencias (fetch nativo). No commitear secretos: usa env.
// Uso (PowerShell):
//   $env:SUPABASE_URL="https://xxx.supabase.co"
//   $env:SUPABASE_ANON_KEY="sb_publishable_... (o eyJ...)"
//   node tests/supabase/gate.js
// Auth (barbero) solo si además pasás:
//   $env:TEST_BARBER_JWT="<jwt de sesión barbero>"
//   $env:TEST_RANDOM_JWT="<jwt de usuario común>"
// Al final cancela sus propias reservas de prueba (quedan como
// historial cancelado, por diseño; no toca turnos reales).
// ============================================================

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const BARBER_JWT = process.env.TEST_BARBER_JWT;
const RANDOM_JWT = process.env.TEST_RANDOM_JWT;

if (!URL || !ANON) {
  console.error("Falta SUPABASE_URL o SUPABASE_ANON_KEY en env. No corro nada.");
  process.exit(2);
}

let pasadas = 0;
let falladas = 0;
const fallos = [];
function ok(nombre, cond, detalle = "") {
  if (cond) {
    pasadas += 1;
    console.log(`  ok - ${nombre}`);
  } else {
    falladas += 1;
    fallos.push(nombre);
    console.log(`  FALLO - ${nombre} ${detalle}`);
  }
}

// Llamada REST directa (tabla) o RPC, con la key que corresponda.
async function llamada(metodo, ruta, cuerpo, jwt = null) {
  const res = await fetch(`${URL}${ruta}`, {
    method: metodo,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${jwt ?? ANON}`,
      "Content-Type": "application/json",
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch { /* respuestas vacías */ }
  return { status: res.status, json };
}
const rpc = (fn, args, jwt) =>
  llamada("POST", `/rest/v1/rpc/${fn}`, args, jwt);

// Fecha lejana (hoy+60, saltando domingo) para no pisar turnos reales.
function fechaLejana() {
  const d = new Date();
  d.setDate(d.getDate() + 60);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  const dd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return dd;
}
const nid = () => crypto.randomUUID();
const TEL = (n) => `0999999${String(n).padStart(2, "0")}`.slice(0, 9);
const F = fechaLejana();

// Registro de reservas de prueba: al final se cancelan todas.
// Nunca tocamos filas que no creamos nosotros (solo nuestros request).
const paraLimpiar = [];
function filaDe(res) {
  const f = Array.isArray(res.json) ? res.json[0] : res.json;
  return f?.o_id ? f : null;
}
async function crearTest(hora, nombre, telN) {
  const token = nid();
  const r = await rpc("crear_reserva", {
    p_fecha: F,
    p_hora: hora,
    p_nombre: nombre,
    p_telefono: TEL(telN),
    p_request_id: nid(),
    p_cancel_token: token,
  });
  const fila = filaDe(r);
  if (fila) paraLimpiar.push({ id: fila.o_id, token });
  return { res: r, fila, token };
}
async function limpiarPruebas() {
  let n = 0;
  for (const t of paraLimpiar) {
    try {
      const r = await rpc("cancelar_con_token", { p_id: t.id, p_token: t.token });
      if (r.status === 200) n += 1;
    } catch { /* best-effort */ }
  }
  console.log(`Limpieza: ${n}/${paraLimpiar.length} pruebas canceladas.`);
}

(async () => {
  try {
  console.log("GATE 1: anónimo no toca la tabla directo");
  let r = await llamada("GET", "/rest/v1/reservas?select=id&limit=1");
  ok("anon SELECT denegado", r.status !== 200, `status=${r.status}`);
  r = await llamada("POST", "/rest/v1/reservas", { id: nid() });
  ok("anon INSERT denegado", r.status !== 200 && r.status !== 201, `status=${r.status}`);
  r = await llamada("PATCH", "/rest/v1/reservas?id=eq.x", { estado: "cancelado" });
  ok("anon UPDATE denegado", r.status !== 200, `status=${r.status}`);
  r = await llamada("DELETE", "/rest/v1/reservas?id=eq.x");
  ok("anon DELETE denegado", r.status !== 200, `status=${r.status}`);

  console.log("GATE 2: anónimo no ejecuta RPC de barbero");
  r = await rpc("admin_listar_rango", { d1: "2026-01-01", d2: "2026-01-07" });
  ok("anon admin_listar_rango denegado", r.status !== 200, `status=${r.status}`);
  r = await rpc("admin_cambiar_estado", { p_id: nid(), p_nuevo: "confirmado" });
  ok("anon admin_cambiar_estado denegado", r.status !== 200, `status=${r.status}`);

  console.log("GATE 3: reglas dinámicas en servidor (no solo UI)");
  r = await rpc("obtener_disponibilidad", { dia: "2026-01-04" }); // domingo
  ok("domingo rechazado", r.status !== 200, `status=${r.status}`);
  r = await rpc("crear_reserva", { p_fecha: F, p_hora: "07:00", p_nombre: "Gate Uno", p_telefono: TEL(10), p_request_id: nid(), p_cancel_token: nid() });
  ok("hora fuera de grilla rechazada", r.status !== 200, `status=${r.status}`);
  r = await rpc("crear_reserva", { p_fecha: F, p_hora: "08:00", p_nombre: "Gate Uno", p_telefono: "123", p_request_id: nid(), p_cancel_token: nid() });
  ok("teléfono inválido rechazado", r.status !== 200, `status=${r.status}`);
  r = await rpc("crear_reserva", { p_fecha: "2020-01-02", p_hora: "08:00", p_nombre: "Gate Uno", p_telefono: TEL(11), p_request_id: nid(), p_cancel_token: nid() });
  ok("fecha pasada rechazada", r.status !== 200, `status=${r.status}`);

  console.log("GATE 4: superficie pública sin PII");
  r = await rpc("obtener_disponibilidad", { dia: F });
  const keys = r.status === 200 && Array.isArray(r.json) && r.json.length > 0 ? Object.keys(r.json[0]).sort().join(",") : "";
  ok("disponibilidad 200 con DTO mínimo", r.status === 200 && keys === "hora,ocupado", `keys=${keys}`);
  const t4 = await crearTest("09:00", "Gate PII", 12);
  const rk = t4.fila ? Object.keys(t4.fila).sort().join(",") : "";
  ok("crear devuelve DTO sin PII", t4.res.status === 200 && rk === "o_estado,o_fecha,o_hora,o_id", `keys=${rk}`);

  console.log("GATE 5: concurrencia — un slot, una ganadora");
  const reqA = nid();
  const reqB = nid();
  const tokA = nid();
  const tokB = nid();
  const [a, b] = await Promise.all([
    rpc("crear_reserva", { p_fecha: F, p_hora: "10:00", p_nombre: "Gate A", p_telefono: TEL(20), p_request_id: reqA, p_cancel_token: tokA }),
    rpc("crear_reserva", { p_fecha: F, p_hora: "10:00", p_nombre: "Gate B", p_telefono: TEL(21), p_request_id: reqB, p_cancel_token: tokB }),
  ]);
  const ganadas = [a, b].filter((x) => x.status === 200).length;
  ok("exactamente una gana", ganadas === 1, `ok=${ganadas}`);
  const perdedora = [a, b].find((x) => x.status !== 200);
  ok("perdedora dice SLOT_OCUPADO", JSON.stringify(perdedora?.json).includes("SLOT_OCUPADO"));
  // Registramos la ganadora (token conocido) para limpiarla al final.
  const ladoA = filaDe(a);
  const ladoB = filaDe(b);
  if (ladoA) paraLimpiar.push({ id: ladoA.o_id, token: tokA });
  if (ladoB) paraLimpiar.push({ id: ladoB.o_id, token: tokB });

  console.log("GATE 6: idempotencia");
  const reqI = nid();
  const tokI = nid();
  const i1 = await rpc("crear_reserva", { p_fecha: F, p_hora: "11:00", p_nombre: "Gate I", p_telefono: TEL(30), p_request_id: reqI, p_cancel_token: tokI });
  const f1 = filaDe(i1);
  if (f1) paraLimpiar.push({ id: f1.o_id, token: tokI });
  const i2 = await rpc("crear_reserva", { p_fecha: F, p_hora: "11:00", p_nombre: "Gate I", p_telefono: TEL(30), p_request_id: reqI, p_cancel_token: tokI });
  ok("mismo request_id + mismo payload = mismo resultado", i1.status === 200 && i2.status === 200 && JSON.stringify(i1.json) === JSON.stringify(i2.json));
  const iToken = await rpc("crear_reserva", { p_fecha: F, p_hora: "11:00", p_nombre: "Gate I", p_telefono: TEL(30), p_request_id: reqI, p_cancel_token: nid() });
  ok("mismo request_id + otro token se rechaza", iToken.status !== 200 && JSON.stringify(iToken.json).includes("IDEMPOTENCY_KEY_REUSED"));
  const i3 = await rpc("crear_reserva", { p_fecha: F, p_hora: "12:00", p_nombre: "Otro Dos", p_telefono: TEL(31), p_request_id: reqI, p_cancel_token: nid() });
  ok("mismo request_id + distinto payload = IDEMPOTENCY_KEY_REUSED", i3.status !== 200 && JSON.stringify(i3.json).includes("IDEMPOTENCY_KEY_REUSED"));

  console.log("GATE 7: propiedad y ciclo de vida");
  const t7 = await crearTest("13:00", "Gate C", 40);
  ok("creada para ciclo", t7.res.status === 200);
  let rW = await rpc("cancelar_con_token", { p_id: t7.fila?.o_id, p_token: nid() });
  ok("token erróneo denegado", rW.status !== 200, `status=${rW.status}`);
  rW = await rpc("cancelar_con_token", { p_id: t7.fila?.o_id, p_token: t7.token });
  ok("token correcto cancela (fila conservada)", rW.status === 200, `status=${rW.status}`);
  // Ya está cancelada: la sacamos de la lista de limpieza.
  const idx7 = paraLimpiar.findIndex((t) => t.id === t7.fila?.o_id);
  if (idx7 >= 0) paraLimpiar.splice(idx7, 1);
  r = await rpc("obtener_disponibilidad", { dia: F });
  const h13 = Array.isArray(r.json) ? r.json.find((h) => h.hora === "13:00") : null;
  ok("slot liberado tras cancelar", h13 && h13.ocupado === false);

  console.log("GATE 8 (auth, opcional): barbero vs usuario común");
  if (!BARBER_JWT || !RANDOM_JWT) {
    console.log("  SKIP - pasá TEST_BARBER_JWT y TEST_RANDOM_JWT para correrlo");
  } else {
    r = await rpc("admin_listar_rango", { d1: F, d2: F }, RANDOM_JWT);
    ok("usuario común no administra", r.status !== 200 || JSON.stringify(r.json).includes("SOLO_BARBERO"));
    r = await rpc("admin_listar_rango", { d1: F, d2: F }, BARBER_JWT);
    ok("barbero sí lista", r.status === 200 && Array.isArray(r.json));
    // Transiciones sobre una reserva creada por el propio gate (nunca real).
    const t8 = await crearTest("14:00", "Gate T", 50);
    if (t8.fila) {
      const g1 = await llamada("POST", "/rest/v1/rpc/admin_cambiar_estado", { p_id: t8.fila.o_id, p_nuevo: "confirmado" }, BARBER_JWT);
      ok("transición válida pendiente→confirmado", g1.status === 200, `status=${g1.status}`);
      const g2 = await llamada("POST", "/rest/v1/rpc/admin_cambiar_estado", { p_id: t8.fila.o_id, p_nuevo: "pendiente" }, BARBER_JWT);
      ok("transición inválida confirmado→pendiente rechazada", g2.status !== 200);
    } else {
      console.log("  SKIP - no se pudo crear fila para transiciones");
    }
  }

  } finally {
    await limpiarPruebas();
  }
  console.log(`\nResultado: ${pasadas} ok, ${falladas} fallos.`);
  if (falladas > 0) {
    console.log(`Fallaron: ${fallos.join(" | ")}`);
    process.exitCode = 1;
  }
})().catch((e) => {
  console.error(`ERROR de red/ejecución: ${e.message}`);
  process.exit(1);
});
