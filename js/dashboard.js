// ============================================================
// DASHBOARD del barbero — vía RPC de admin (requiere login)
// ------------------------------------------------------------
// - Solo entra con sesión (si no, va a login.html).
// - Lee con admin_listar_rango (verifica que sos barbero en servidor).
// - Cambia estados con admin_cambiar_estado (máquina de estados).
// - Nunca toca la tabla directo: cero policies para anon.
// ============================================================

const campoFecha = document.querySelector("#dashboard-fecha");
const botonHoy = document.querySelector("#dashboard-hoy");
const botonRecargar = document.querySelector("#dashboard-recargar");
const botonSalir = document.querySelector("#dashboard-salir");
const cartel = document.querySelector("#dashboard-status");
const lista = document.querySelector("#dashboard-lista");
const semanaCaja = document.querySelector("#dashboard-semana");
const statHoy = document.querySelector("#stat-hoy");
const statHoyPct = document.querySelector("#stat-hoy-pct");
const statHoyBar = document.querySelector("#stat-hoy-bar");
const statPendientes = document.querySelector("#stat-pendientes");
const statSemana = document.querySelector("#stat-semana");
const statSemanaTop = document.querySelector("#stat-semana-top");
const statCancel = document.querySelector("#stat-cancel");
const statCancelPct = document.querySelector("#stat-cancel-pct");

// Capacidad real: 10 turnos por día (08:00–17:00).
const SLOTS_POR_DIA = 10;

function hoyValor() {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(h.getDate()).padStart(2, "0")}`;
}
if (campoFecha && !campoFecha.value) campoFecha.value = hoyValor();

function mostrarCartel(texto, tipo = "info") {
  if (!texto) {
    cartel.hidden = true;
    return;
  }
  cartel.textContent = texto;
  cartel.dataset.tipo = tipo;
  cartel.hidden = false;
}

function telefonoWhatsApp(tel) {
  const n = String(tel).replace(/[^0-9]/g, "");
  return n.startsWith("0") ? `598${n.slice(1)}` : n;
}

function fechaCorta(valor) {
  const dias = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const p = String(valor).split("-").map(Number);
  if (p.length !== 3) return valor;
  const f = new Date(p[0], p[1] - 1, p[2]);
  if (Number.isNaN(f.getTime())) return valor;
  return `${dias[f.getDay()]} ${String(p[2]).padStart(2, "0")} ${meses[p[1] - 1]}`;
}

// Rango a pedir: semana (lun–sáb) de la fecha elegida, extendido si
// la fecha cae fuera (una sola llamada para día + semana + reincidentes).
function rangoPedido(fechaBase) {
  const b = new Date(`${fechaBase}T12:00:00`);
  const dow = (b.getDay() + 6) % 7;
  const lun = new Date(b);
  lun.setDate(b.getDate() - dow);
  const sab = new Date(lun);
  sab.setDate(lun.getDate() + 5);
  const f = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const sel = fechaBase;
  return { desde: f(lun) < sel ? f(lun) : sel, hasta: f(sab) > sel ? f(sab) : sel, lunes: f(lun) };
}

function crearTarjetaTurno(t) {
  const tarjeta = document.createElement("article");
  tarjeta.className = "turno";
  if (t.o_estado === "cancelado") tarjeta.classList.add("turno--cancelado");

  const hora = document.createElement("div");
  hora.className = "turno__hora";
  hora.textContent = t.o_hora;

  const datos = document.createElement("div");
  datos.className = "turno__datos";
  const nombre = document.createElement("strong");
  nombre.textContent = t.o_nombre;
  const fecha = document.createElement("span");
  fecha.className = "turno__fecha";
  fecha.textContent = `${fechaCorta(t.o_fecha)} · ${t.o_hora} hs`;
  const contacto = document.createElement("div");
  contacto.className = "turno__contacto";
  const wa = telefonoWhatsApp(t.o_telefono);
  const tel = document.createElement("a");
  tel.className = "turno__tel";
  tel.href = `tel:+${wa}`;
  tel.textContent = t.o_telefono;
  const linkWa = document.createElement("a");
  linkWa.className = "turno__wa";
  linkWa.href = `https://wa.me/${wa}?text=${encodeURIComponent(`Hola ${t.o_nombre}, te escribo por tu turno del ${t.o_fecha} a las ${t.o_hora}.`)}`;
  linkWa.target = "_blank";
  linkWa.rel = "noopener noreferrer";
  linkWa.textContent = "WHATSAPP ↗";
  contacto.append(tel, linkWa);
  const etiqueta = document.createElement("small");
  etiqueta.className = "turno__estado";
  etiqueta.textContent = t.o_estado;
  etiqueta.dataset.estado = t.o_estado;
  datos.append(nombre, fecha, contacto, etiqueta);

  const acciones = document.createElement("div");
  acciones.className = "turno__acciones";
  [["confirmado", "CONFIRMAR"], ["atendido", "ATENDIDO"], ["cancelado", "CANCELAR"]].forEach(([estado, texto]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = texto;
    btn.dataset.accion = estado;
    if (t.o_estado === estado) btn.disabled = true;
    btn.addEventListener("click", () => cambiarEstado(t.o_id, estado));
    acciones.appendChild(btn);
  });
  tarjeta.append(hora, datos, acciones);
  return tarjeta;
}

async function cambiarEstado(id, estado) {
  try {
    const { error } = await globalThis.supabaseBarberia.rpc("admin_cambiar_estado", { p_id: id, p_nuevo: estado });
    if (error) throw error;
    await cargarTodo();
  } catch (e) {
    const msg = /TRANSICION_INVALIDA/.test(e.message || "") ? "Ese cambio de estado no está permitido." : "No se pudo cambiar el estado.";
    mostrarCartel(msg, "error");
  }
}

function dibujarSemana(dias) {
  semanaCaja.innerHTML = "";
  const maximo = Math.max(1, ...dias.map((d) => d.total));
  const nombres = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  dias.forEach((d, i) => {
    const fila = document.createElement("div");
    fila.className = "semana__dia";
    const s = document.createElement("span");
    s.textContent = `${nombres[i]} ${d.fecha.slice(5)}`;
    const barra = document.createElement("div");
    barra.className = "semana__barra";
    const relleno = document.createElement("i");
    relleno.style.width = `${(d.total / maximo) * 100}%`;
    barra.appendChild(relleno);
    const total = document.createElement("strong");
    total.textContent = d.total;
    fila.append(s, barra, total);
    semanaCaja.appendChild(fila);
  });
}

function dibujarReincidentes(filas) {
  const caja = document.querySelector("#dashboard-reincidentes");
  if (!caja) return;
  const conteo = new Map();
  (filas || []).forEach((r) => {
    if (r.o_estado !== "cancelado") return;
    const k = `${r.o_nombre} · ${r.o_telefono}`;
    conteo.set(k, (conteo.get(k) || 0) + 1);
  });
  const top = [...conteo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  caja.innerHTML = "";
  if (top.length === 0) {
    caja.innerHTML = "<p class='dashboard-vacio'>Sin cancelaciones registradas. Bien ahí.</p>";
    return;
  }
  top.forEach(([quien, veces]) => {
    const fila = document.createElement("div");
    fila.className = "reincidente";
    const n = document.createElement("strong");
    n.textContent = quien;
    const c = document.createElement("span");
    c.className = "reincidente__count";
    c.textContent = `${veces}×`;
    fila.append(n, c);
    caja.appendChild(fila);
  });
}

async function cargarTodo() {
  const fecha = campoFecha.value || hoyValor();
  mostrarCartel("Cargando turnos...");
  lista.innerHTML = "";
  try {
    const cliente = globalThis.supabaseBarberia;
    const { desde, hasta, lunes } = rangoPedido(fecha);
    const { data, error } = await cliente.rpc("admin_listar_rango", { d1: desde, d2: hasta });
    if (error) throw error;
    const filas = data || [];
    const delDia = filas.filter((r) => r.o_fecha === fecha);

    // Ocupación del día + por confirmar.
    const validos = delDia.filter((t) => t.o_estado !== "cancelado").length;
    const pct = Math.round((validos / SLOTS_POR_DIA) * 100);
    statHoy.textContent = `${validos}/${SLOTS_POR_DIA}`;
    if (statHoyPct) statHoyPct.textContent = `${pct}% lleno`;
    if (statHoyBar) statHoyBar.style.width = `${Math.min(100, pct)}%`;
    statPendientes.textContent = delDia.filter((t) => t.o_estado === "pendiente").length;

    if (delDia.length === 0) {
      mostrarCartel("");
      lista.innerHTML = "<p class='dashboard-vacio'>Sin turnos este día. Cuando alguien reserve en la agenda, aparece acá.</p>";
    } else {
      mostrarCartel(`${delDia.length} turno(s) el ${fecha}.`, "exito");
      delDia.forEach((t) => lista.appendChild(crearTarjetaTurno(t)));
    }

    // Semana lun–sáb + top día + cancelados/tasa (solo rango semanal real).
    const dias = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(`${lunes}T12:00:00`);
      d.setDate(d.getDate() + i);
      const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      dias.push({ fecha: v, total: filas.filter((r) => r.o_fecha === v && r.o_estado !== "cancelado").length });
    }
    const totalSemana = dias.reduce((n, d) => n + d.total, 0);
    statSemana.textContent = totalSemana;
    const top = dias.reduce((m, d) => (d.total > m.total ? d : m), dias[0]);
    const nombres = ["lun", "mar", "mié", "jue", "vie", "sáb"];
    if (statSemanaTop) statSemanaTop.textContent = top.total > 0 ? `top: ${nombres[dias.indexOf(top)]} (${top.total})` : "semana libre";
    const cancelados = filas.filter((r) => r.o_estado === "cancelado").length;
    const pedidos = filas.length;
    const tasa = pedidos > 0 ? Math.round((cancelados / pedidos) * 100) : 0;
    if (statCancel) statCancel.textContent = cancelados;
    if (statCancelPct) statCancelPct.textContent = pedidos > 0 ? `${tasa}% de ${pedidos}` : "sin pedidos";
    dibujarSemana(dias);
    dibujarReincidentes(filas);
  } catch (e) {
    const msg = /SOLO_BARBERO/.test(e.message || "")
      ? "Tu usuario no es barbero. Pedí acceso e intentá de nuevo."
      : "No pude leer. Revisá conexión y sesión.";
    mostrarCartel(msg, "error");
  }
}

botonHoy?.addEventListener("click", () => {
  campoFecha.value = hoyValor();
  cargarTodo();
});
botonRecargar?.addEventListener("click", cargarTodo);
campoFecha?.addEventListener("change", cargarTodo);
botonSalir?.addEventListener("click", async () => {
  await globalThis.supabaseBarberia.auth.signOut();
  window.location.assign("login.html");
});

// Puerta: sin nube o sin sesión no hay dashboard (mensaje, nunca pantalla rota).
(async () => {
  const cliente = globalThis.supabaseBarberia;
  if (!cliente || !window.supabase) {
    mostrarCartel("No pude conectar con la nube. Revisá js/supabase-client.js y tu conexión.", "error");
    return;
  }
  let sesion = null;
  try {
    ({ data: { session: sesion } } = await cliente.auth.getSession());
  } catch {
    sesion = null;
  }
  if (!sesion) {
    window.location.assign("login.html");
    return;
  }
  cargarTodo();
})();
