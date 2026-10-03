// ============================================================
// DASHBOARD: lo que ve el barbero (dashboard.html) — versión Supabase
// ------------------------------------------------------------
// Antes hablaba a "localhost" (tu compu). Ahora habla al cuaderno
// en la nube (Supabase), que anda en GitHub Pages sin prender nada.
// - Leer día = supabase.from("reservas").select().eq("fecha", ...)
// - Cambiar estado = .update({ estado }).eq("id", ...)
// - Borrar = .delete().eq("id", ...)
// - Semana = pedir desde el lunes hasta el sábado y contar.
// ============================================================

const campoFecha = document.querySelector("#dashboard-fecha");
const botonHoy = document.querySelector("#dashboard-hoy");
const botonRecargar = document.querySelector("#dashboard-recargar");
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

// Capacidad real: 10 turnos por día (08:00–17:00). Si cambiás horarios,
// cambiá este número para que la ocupación dé bien.
const SLOTS_POR_DIA = 10;

// -- Atajo al cable que creaste en supabase-client.js --
function base() {
  const cliente = globalThis.supabaseBarberia;
  if (!cliente) throw new Error("Falta configurar js/supabase-client.js");
  return cliente;
}

// -- Fecha de hoy en formato AAAA-MM-DD (el que entiende la base) --
function hoyValor() {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(h.getDate()).padStart(2, "0")}`;
}

// Si el campo está vacío, lo ponemos en hoy.
if (campoFecha && !campoFecha.value) campoFecha.value = hoyValor();

// -- Mostrar un mensajito gris/rojo/verde arriba de la lista --
function mostrarCartel(texto, tipo = "info") {
  if (!texto) {
    cartel.hidden = true;
    return;
  }
  cartel.textContent = texto;
  cartel.dataset.tipo = tipo;
  cartel.hidden = false;
}

// -- Convertir 091234567 en 59891234567 para el link de WhatsApp --
function telefonoWhatsApp(tel) {
  const soloNumeros = String(tel).replace(/[^0-9]/g, "");
  return soloNumeros.startsWith("0") ? `598${soloNumeros.slice(1)}` : soloNumeros;
}

// -- Fecha linda y corta: "2026-10-03" → "vie 03 oct" (no se rompe) --
function fechaCorta(valor) {
  const nombresDia = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const partes = String(valor).split("-").map(Number);
  if (partes.length !== 3) return valor;
  const [anio, mes, dia] = partes;
  const fecha = new Date(anio, mes - 1, dia);
  if (Number.isNaN(fecha.getTime())) return valor;
  return `${nombresDia[fecha.getDay()]} ${String(dia).padStart(2, "0")} ${meses[mes - 1]}`;
}

// -- Dibujar un turno en la lista izquierda (estructura limpia, sin <br>) --
function crearTarjetaTurno(turno) {
  const tarjeta = document.createElement("article");
  tarjeta.className = "turno";
  if (turno.estado === "cancelado") tarjeta.classList.add("turno--cancelado");

  const hora = document.createElement("div");
  hora.className = "turno__hora";
  hora.textContent = turno.hora;

  // Columna del medio: nombre + fecha en 1 línea + teléfono/WhatsApp + estado.
  const datos = document.createElement("div");
  datos.className = "turno__datos";

  const nombre = document.createElement("strong");
  nombre.textContent = turno.nombre;

  const fecha = document.createElement("span");
  fecha.className = "turno__fecha";
  fecha.textContent = `${fechaCorta(turno.fecha)} · ${turno.hora} hs`;

  const contacto = document.createElement("div");
  contacto.className = "turno__contacto";
  const wa = telefonoWhatsApp(turno.telefono);
  const linkLlamar = document.createElement("a");
  linkLlamar.href = `tel:+${wa}`;
  linkLlamar.textContent = turno.telefono;
  const sep = document.createElement("span");
  sep.className = "turno__sep";
  sep.textContent = "·";
  sep.setAttribute("aria-hidden", "true");
  const linkWa = document.createElement("a");
  linkWa.href = `https://wa.me/${wa}?text=${encodeURIComponent(`Hola ${turno.nombre}, te escribo por tu turno del ${turno.fecha} a las ${turno.hora}.`)}`;
  linkWa.target = "_blank";
  linkWa.rel = "noopener noreferrer";
  linkWa.textContent = "WhatsApp";
  contacto.append(linkLlamar, sep, linkWa);

  const etiqueta = document.createElement("small");
  etiqueta.className = "turno__estado";
  etiqueta.textContent = turno.estado;
  etiqueta.dataset.estado = turno.estado;

  datos.append(nombre, fecha, contacto, etiqueta);

  // Botones: confirmar, atendido, cancelar. SIN borrar: el historial se guarda.
  const acciones = document.createElement("div");
  acciones.className = "turno__acciones";
  const botones = [
    ["confirmado", "CONFIRMAR"],
    ["atendido", "ATENDIDO"],
    ["cancelado", "CANCELAR"],
  ];
  botones.forEach(([estado, texto]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = texto;
    b.dataset.accion = estado;
    // Si ya está en ese estado, apagamos su botón para no repetir.
    if (turno.estado === estado) b.disabled = true;
    b.addEventListener("click", () => cambiarEstado(turno.id, estado));
    acciones.appendChild(b);
  });

  tarjeta.append(hora, datos, acciones);
  return tarjeta;
}

// -- Pedir los turnos del día a Supabase y dibujarlos --
async function cargarDia() {
  const fecha = campoFecha.value || hoyValor();
  mostrarCartel("Cargando turnos...");
  lista.innerHTML = "";
  try {
    const { data: turnos, error } = await base()
      .from("reservas")
      .select("*")
      .eq("fecha", fecha)
      .order("hora");
    if (error) throw error;

    // Ocupación del día: válidos (sin cancelados) sobre capacidad real.
    const validos = turnos.filter((t) => t.estado !== "cancelado").length;
    const pct = Math.round((validos / SLOTS_POR_DIA) * 100);
    statHoy.textContent = `${validos}/${SLOTS_POR_DIA}`;
    if (statHoyPct) statHoyPct.textContent = `${pct}% lleno`;
    if (statHoyBar) statHoyBar.style.width = `${Math.min(100, pct)}%`;
    // Por confirmar: pendientes que esperan tu WhatsApp.
    statPendientes.textContent = turnos.filter((t) => t.estado === "pendiente").length;

    if (turnos.length === 0) {
      mostrarCartel("");
      const vacio = document.createElement("p");
      vacio.className = "dashboard-vacio";
      vacio.textContent = `Sin turnos el ${fecha}. Cuando alguien reserve en la agenda, aparece acá.`;
      lista.appendChild(vacio);
      return;
    }
    mostrarCartel(`${turnos.length} turno(s) el ${fecha}.`, "exito");
    turnos.forEach((t) => lista.appendChild(crearTarjetaTurno(t)));
  } catch {
    mostrarCartel("No pude leer Supabase. ¿Pegaste URL y KEY en js/supabase-client.js?", "error");
  }
}

// -- Cambiar estado en Supabase --
async function cambiarEstado(id, estado) {
  try {
    const { error } = await base().from("reservas").update({ estado }).eq("id", id);
    if (error) throw error;
    await cargarTodo();
  } catch {
    mostrarCartel("No se pudo cambiar el estado.", "error");
  }
}

// -- Ranking de reincidentes: los que más cancelaron (historial que no se borra) --
// Agrupa por teléfono (más fiable que el nombre) y muestra top 5.
async function cargarReincidentes() {
  const caja = document.querySelector("#dashboard-reincidentes");
  if (!caja) return;
  try {
    const { data, error } = await base()
      .from("reservas")
      .select("nombre,telefono")
      .eq("estado", "cancelado")
      .limit(1000);
    if (error) throw error;
    const conteo = new Map();
    (data || []).forEach((r) => {
      const clave = `${r.nombre} · ${r.telefono}`;
      conteo.set(clave, (conteo.get(clave) || 0) + 1);
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
      const nombre = document.createElement("strong");
      nombre.textContent = quien;
      const count = document.createElement("span");
      count.className = "reincidente__count";
      count.textContent = `${veces}×`;
      count.title = `${veces} cancelaciones`;
      fila.append(nombre, count);
      caja.appendChild(fila);
    });
  } catch {
    caja.innerHTML = "<p class='dashboard-vacio'>No se pudo cargar reincidentes.</p>";
  }
}

// -- Semana Lun-Sáb: pedimos el rango y contamos en la página --
async function cargarSemana() {
  const fechaBase = campoFecha.value || hoyValor();
  try {
    const baseFecha = new Date(`${fechaBase}T12:00:00`);
    const diaSemana = (baseFecha.getDay() + 6) % 7; // lunes=0
    const lunes = new Date(baseFecha);
    lunes.setDate(baseFecha.getDate() - diaSemana);
    const sabado = new Date(lunes);
    sabado.setDate(lunes.getDate() + 5);
    const inicio = `${lunes.getFullYear()}-${String(lunes.getMonth() + 1).padStart(2, "0")}-${String(lunes.getDate()).padStart(2, "0")}`;
    const fin = `${sabado.getFullYear()}-${String(sabado.getMonth() + 1).padStart(2, "0")}-${String(sabado.getDate()).padStart(2, "0")}`;

    const { data, error } = await base()
      .from("reservas")
      .select("fecha,estado")
      .gte("fecha", inicio)
      .lte("fecha", fin);
    if (error) throw error;

    // Armamos los 6 días y contamos (sin cancelados). Además contamos
    // cancelados de la semana para la tasa de cancelación.
    const dias = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(lunes);
      d.setDate(lunes.getDate() + i);
      const valor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const total = data.filter((r) => r.fecha === valor && r.estado !== "cancelado").length;
      dias.push({ fecha: valor, total });
    }
    const totalSemana = dias.reduce((n, d) => n + d.total, 0);
    statSemana.textContent = totalSemana;
    // Día más cargado: nombre + cantidad (ej: "vie (5)").
    const nombres = ["lun", "mar", "mié", "jue", "vie", "sáb"];
    const topDia = dias.reduce((mejor, d) => (d.total > mejor.total ? d : mejor), dias[0]);
    const idxTop = dias.indexOf(topDia);
    if (statSemanaTop) {
      statSemanaTop.textContent = topDia.total > 0 ? `top: ${nombres[idxTop]} (${topDia.total})` : "semana libre";
    }
    // Cancelados de la semana + tasa sobre todo lo pedido.
    const cancelados = (data || []).filter((r) => r.estado === "cancelado").length;
    const pedidos = totalSemana + cancelados;
    const tasa = pedidos > 0 ? Math.round((cancelados / pedidos) * 100) : 0;
    if (statCancel) statCancel.textContent = cancelados;
    if (statCancelPct) statCancelPct.textContent = pedidos > 0 ? `${tasa}% de ${pedidos}` : "sin pedidos";
    semanaCaja.innerHTML = "";
    const maximo = Math.max(1, ...dias.map((d) => d.total));
    const nombresMay = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    dias.forEach((d, i) => {
      const fila = document.createElement("div");
      fila.className = "semana__dia";
      fila.innerHTML = `<span></span><div class="semana__barra"><i></i></div><strong></strong>`;
      fila.querySelector("span").textContent = `${nombresMay[i]} ${d.fecha.slice(5)}`;
      fila.querySelector("i").style.width = `${(d.total / maximo) * 100}%`;
      fila.querySelector("strong").textContent = d.total;
      semanaCaja.appendChild(fila);
    });
  } catch {
    semanaCaja.innerHTML = "<p class='dashboard-vacio'>No se pudo cargar la semana. Revisá tu URL y KEY.</p>";
  }
}

async function cargarTodo() {
  await cargarDia();
  await cargarSemana();
  await cargarReincidentes();
}

botonHoy?.addEventListener("click", () => {
  campoFecha.value = hoyValor();
  cargarTodo();
});
botonRecargar?.addEventListener("click", cargarTodo);
campoFecha?.addEventListener("change", cargarTodo);

cargarTodo();
