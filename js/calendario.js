// ============================================================
// CALENDARIO: agenda que habla con Supabase vía RPC (modelo seguro)
// ------------------------------------------------------------
// Regla de oro: el navegador PIDE, la base DECIDE.
// - Ver horas libres → RPC obtener_disponibilidad (sin PII).
// - Reservar → RPC crear_reserva (valida todo en servidor).
// - Cambiar → RPC cambiar_con_token (atómica: o todo o nada).
// - Cancelar → RPC cancelar_con_token (conserva historial).
// Mi turno + secretos viven en localStorage (request/token los
// genera el cliente ANTES de llamar, por si la respuesta se pierde).
// ============================================================

const {
  crearFechaDesdeValor,
  diasSemana,
  formatearFecha,
  formatearFechaLarga,
  formatearFechaValor,
  horarios,
  horarioYaPaso,
  obtenerProximosDiasAbiertos,
  turnoYaPaso,
} = globalThis.CalendarioFechas;

const calendario = document.querySelector("#calendario");
const estadoAgenda = document.querySelector("#agenda-status");
const modalTurno = document.querySelector("#booking-modal");
const formularioTurno = document.querySelector("#booking-form");
const confirmacionTurno = document.querySelector("#booking-success");
const mensajeConfirmacion = document.querySelector("#booking-success-message");
const textoFecha = document.querySelector("#turno-fecha");
const textoHora = document.querySelector("#turno-hora");
const campoFecha = document.querySelector("#turno-fecha-value");
const campoHora = document.querySelector("#turno-hora-value");
const campoNombre = document.querySelector("#turno-nombre");
const campoTelefono = document.querySelector("#turno-telefono");
const feedbackFormulario = document.querySelector("#booking-form-feedback");
const botonEnviar = document.querySelector("[data-submit-turno]");
const etiquetaBotonEnviar = document.querySelector("[data-submit-label]");
const textoSuperiorModal = document.querySelector("[data-modal-eyebrow]");
const tituloModal = document.querySelector("#booking-modal-title");
const tituloConfirmacion = document.querySelector("[data-success-title]");
const reservaActivaPanel = document.querySelector("#active-booking");
const reservaActivaFecha = document.querySelector("#active-booking-date");
const reservaActivaDia = document.querySelector("#active-booking-day");
const reservaActivaHora = document.querySelector("#active-booking-time");
const botonCambiarTurno = document.querySelector("[data-change-turno]");
const botonCancelarTurno = document.querySelector("[data-cancel-turno]");
const modalCancelacion = document.querySelector("#cancel-modal");
const textoTurnoCancelacion = document.querySelector("#cancel-modal-turn");
const botonConfirmarCancelacion = document.querySelector("[data-confirm-cancel]");

// -- Cliente nube (o null si falta configurar js/supabase-client.js) --
function sb() {
  const c = globalThis.supabaseBarberia;
  if (!c || !window.supabase) return null;
  try {
    if ((c.supabaseUrl || "").includes("PEGÁ-ACÁ")) return null;
  } catch { /* seguimos */ }
  return c;
}

// Llama una RPC y devuelve { fila, codigoError }.
// codigoError es el texto del RAISE (SLOT_OCUPADO, TOPE_POR_TELEFONO, ...).
async function llamarRpc(nombre, args) {
  const cliente = sb();
  if (!cliente) return { fila: null, codigoError: "SIN_NUBE" };
  const { data, error } = await cliente.rpc(nombre, args);
  if (error) return { fila: null, codigoError: error.message || "ERROR_RED" };
  const fila = Array.isArray(data) ? data[0] ?? null : data;
  return { fila, codigoError: null };
}

// -- Estado en memoria + mi turno guardado --
const CLAVE_MI_TURNO = "streetBarberMiTurno";
const ocupados = new Set(); // slotKeys "AAAA-MM-DD|HH:MM" ocupados según la nube
let miTurno = null; // { id, token, fecha, hora, fechaVisible, nombre, telefono }
let turnoSeleccionado = null;
let horarioSeleccionado = null;
let enviandoFormulario = false;
let modoReprogramacion = false;

function llaveSlot(fechaValor, hora) {
  return `${fechaValor}|${hora}`;
}

function leerMiTurno() {
  try {
    const t = JSON.parse(localStorage.getItem(CLAVE_MI_TURNO) ?? "null");
    if (t?.id && t?.token && t?.fecha && t?.hora) return t;
  } catch { /* sin storage seguimos sin turno */ }
  return null;
}

function guardarMiTurno(t) {
  miTurno = t;
  try {
    if (t) localStorage.setItem(CLAVE_MI_TURNO, JSON.stringify(t));
    else localStorage.removeItem(CLAVE_MI_TURNO);
  } catch { /* solo memoria */ }
}

miTurno = leerMiTurno();

// -- Prefill desde la home (nombre/teléfono, NO el turno) --
const datosIniciales = { nombre: "", telefono: "" };
try {
  const g = JSON.parse(sessionStorage.getItem("streetBarberPrefill") ?? "null");
  if (g && typeof g === "object") {
    datosIniciales.nombre = g.nombre ?? "";
    datosIniciales.telefono = g.telefono ?? "";
  }
} catch { /* la agenda anda igual */ }
const parametros = new URLSearchParams(window.location.search);
datosIniciales.nombre ||= parametros.get("nombre") ?? "";
datosIniciales.telefono ||= parametros.get("telefono") ?? "";
if (parametros.size > 0) {
  try {
    history.replaceState(null, "", `${window.location.pathname}#calendario`);
  } catch { /* igual */ }
}

// -- ¿Mi turno guardado sigue en el futuro? Si no, se olvida solo. --
function miTurnoVigente(ahora = new Date()) {
  if (!miTurno) return false;
  const fecha = crearFechaDesdeValor(miTurno.fecha);
  if (!fecha || !miTurno.hora || turnoYaPaso(fecha, miTurno.hora, ahora)) {
    guardarMiTurno(null);
    return false;
  }
  return true;
}
miTurnoVigente();

function actualizarPanelReserva() {
  if (!reservaActivaPanel) return;
  if (!miTurno || !miTurnoVigente()) {
    reservaActivaPanel.hidden = true;
    reservaActivaPanel.classList.remove("active-booking--changing");
    return;
  }
  const fecha = crearFechaDesdeValor(miTurno.fecha);
  reservaActivaPanel.hidden = false;
  reservaActivaPanel.classList.toggle("active-booking--changing", modoReprogramacion);
  reservaActivaDia.textContent = formatearFechaLarga(fecha);
  reservaActivaHora.textContent = `${miTurno.hora} hs`;
  reservaActivaFecha.dateTime = `${miTurno.fecha}T${miTurno.hora}`;
  botonCambiarTurno.textContent = modoReprogramacion ? "CANCELAR CAMBIO" : "CAMBIAR TURNO";
}

function configurarModalReserva() {
  const cambiando = Boolean(miTurno && modoReprogramacion);
  textoSuperiorModal.textContent = cambiando ? "ELEGISTE UN NUEVO HORARIO" : "COMPLETÁ TUS DATOS";
  tituloModal.textContent = cambiando ? "Cambiá tu turno" : "Reservá tu turno";
  etiquetaBotonEnviar.textContent = cambiando ? "CONFIRMAR CAMBIO" : "QUIERO MI TURNO";
}

function mostrarEstadoAgenda(mensaje, tipo = "info") {
  estadoAgenda.textContent = mensaje;
  estadoAgenda.dataset.tipo = tipo;
  estadoAgenda.hidden = !mensaje;
}

function mostrarErrorFormulario(mensaje) {
  feedbackFormulario.textContent = mensaje;
  feedbackFormulario.hidden = false;
}

function ocultarErrorFormulario() {
  feedbackFormulario.textContent = "";
  feedbackFormulario.hidden = true;
}

function restablecerBotonEnviar() {
  enviandoFormulario = false;
  botonEnviar.disabled = false;
  botonEnviar.removeAttribute("aria-busy");
}

// turnedo: propio (mío) / ocupado (nube) / pasado / seleccionado / disponible
function obtenerEstadoTurno(fechaObj, fechaValor, hora, ahora = new Date()) {
  if (miTurno && miTurnoVigente(ahora) && miTurno.fecha === fechaValor && miTurno.hora === hora) {
    return "propio";
  }
  if (ocupados.has(llaveSlot(fechaValor, hora))) return "ocupado";
  if (horarioYaPaso(fechaObj, hora, ahora)) return "pasado";
  if (turnoSeleccionado && turnoSeleccionado.llave === llaveSlot(fechaValor, hora)) return "seleccionado";
  return "disponible";
}

function abrirFormularioTurno(fechaObj, fechaValor, fechaVisible, hora, boton) {
  const estadoTurno = obtenerEstadoTurno(fechaObj, fechaValor, hora);
  if (modalTurno.open || boton.disabled || (estadoTurno !== "disponible" && estadoTurno !== "seleccionado")) {
    return;
  }
  if (miTurno && miTurnoVigente() && !modoReprogramacion) {
    mostrarEstadoAgenda("Ya tenés un turno activo. Podés cambiarlo o cancelarlo desde el panel superior.", "info");
    reservaActivaPanel?.scrollIntoView({ behavior: "smooth", block: "center" });
    botonCambiarTurno?.focus({ preventScroll: true });
    return;
  }
  turnoSeleccionado = { llave: llaveSlot(fechaValor, hora), fecha: fechaValor, fechaVisible, hora };
  horarioSeleccionado?.classList.remove("seleccionado");
  horarioSeleccionado?.setAttribute("aria-pressed", "false");
  horarioSeleccionado = boton;
  horarioSeleccionado.classList.add("seleccionado");
  horarioSeleccionado.setAttribute("aria-pressed", "true");
  horarioSeleccionado.setAttribute("aria-label", `${fechaVisible}, ${hora}, seleccionado`);

  formularioTurno.reset();
  campoNombre.setCustomValidity("");
  campoTelefono.setCustomValidity("");
  campoNombre.value = modoReprogramacion ? miTurno?.nombre ?? datosIniciales.nombre : datosIniciales.nombre;
  campoTelefono.value = modoReprogramacion ? miTurno?.telefono ?? datosIniciales.telefono : datosIniciales.telefono;
  formularioTurno.hidden = false;
  confirmacionTurno.hidden = true;
  ocultarErrorFormulario();
  restablecerBotonEnviar();
  configurarModalReserva();
  textoFecha.textContent = fechaVisible;
  textoHora.textContent = `${hora} hs`;
  campoFecha.value = fechaValor;
  campoHora.value = hora;
  modalTurno.showModal();
  document.body.classList.add("modal-open");
  campoNombre.focus();
}

function cerrarFormularioTurno() {
  if (modalTurno.open) modalTurno.close();
}

function generarCalendario(ahora = new Date()) {
  calendario.innerHTML = "";
  const dias = obtenerProximosDiasAbiertos(ahora, 5);
  dias.forEach((fechaObj) => {
    const fechaValor = formatearFechaValor(fechaObj);
    const columna = document.createElement("section");
    const nombreDia = document.createElement("h3");
    const fechaTexto = document.createElement("time");
    const caja = document.createElement("div");
    const idDia = `dia-${fechaValor}`;
    let n = 0;
    columna.classList.add("dia");
    columna.setAttribute("aria-labelledby", idDia);
    nombreDia.id = idDia;
    nombreDia.textContent = diasSemana[fechaObj.getDay()];
    fechaTexto.classList.add("fecha");
    fechaTexto.dateTime = fechaValor;
    fechaTexto.textContent = formatearFecha(fechaObj);
    caja.classList.add("horarios");
    const fechaVisible = formatearFechaLarga(fechaObj);

    horarios.forEach((hora) => {
      const estadoTurno = obtenerEstadoTurno(fechaObj, fechaValor, hora, ahora);
      if (estadoTurno === "pasado") return;
      n += 1;
      const boton = document.createElement("button");
      boton.classList.add("horario");
      boton.type = "button";
      boton.dataset.estado = estadoTurno;
      if (estadoTurno === "ocupado" || estadoTurno === "propio") {
        const h = document.createElement("span");
        const e = document.createElement("small");
        h.textContent = hora;
        e.textContent = estadoTurno === "propio" ? "TU TURNO" : "OCUPADO";
        boton.append(h, e);
        boton.disabled = true;
        boton.classList.add(estadoTurno);
        boton.setAttribute("aria-label", `${fechaVisible}, ${hora}, ${estadoTurno === "propio" ? "tu turno" : "ocupado"}`);
      } else {
        boton.textContent = hora;
        boton.setAttribute("aria-label", `${fechaVisible}, ${hora}, ${estadoTurno}`);
        boton.setAttribute("aria-pressed", estadoTurno === "seleccionado" ? "true" : "false");
        if (estadoTurno === "seleccionado") boton.classList.add("seleccionado");
        boton.addEventListener("click", () => abrirFormularioTurno(fechaObj, fechaValor, fechaVisible, hora, boton));
      }
      caja.appendChild(boton);
    });

    if (n === 0) {
      const p = document.createElement("p");
      p.classList.add("dia__vacio");
      p.textContent = "Sin horarios disponibles por hoy.";
      caja.appendChild(p);
    }
    columna.append(nombreDia, fechaTexto, caja);
    calendario.appendChild(columna);
  });
}

// -- Trae ocupados de la nube (solo hora+ocupado, sin PII) y redibuja --
async function cargarDisponibilidad() {
  const cliente = sb();
  if (!cliente) {
    mostrarEstadoAgenda("Sin conexión a la nube: revisá js/supabase-client.js. Mostrando vista local.", "error");
    return;
  }
  try {
    const dias = obtenerProximosDiasAbiertos(new Date(), 5);
    for (const d of dias) {
      const valor = formatearFechaValor(d);
      const { data, error } = await cliente.rpc("obtener_disponibilidad", { dia: valor });
      if (error || !data) continue;
      data.forEach((h) => {
        if (h.ocupado) ocupados.add(llaveSlot(valor, h.hora));
      });
    }
  } catch { /* la cartelera local sigue útil */ }
}

actualizarPanelReserva();
generarCalendario();
cargarDisponibilidad().then(() => {
  actualizarPanelReserva();
  generarCalendario();
});

document.querySelectorAll("[data-close-modal]").forEach((b) => b.addEventListener("click", cerrarFormularioTurno));
modalTurno.addEventListener("click", (e) => {
  if (e.target === modalTurno) cerrarFormularioTurno();
});
modalTurno.addEventListener("close", () => {
  if (!modalCancelacion.open) document.body.classList.remove("modal-open");
  horarioSeleccionado?.classList.remove("seleccionado");
  horarioSeleccionado?.setAttribute("aria-pressed", "false");
  horarioSeleccionado = null;
  turnoSeleccionado = null;
  formularioTurno.reset();
  campoNombre.setCustomValidity("");
  campoTelefono.setCustomValidity("");
  formularioTurno.hidden = false;
  confirmacionTurno.hidden = true;
  ocultarErrorFormulario();
  restablecerBotonEnviar();
});

botonCambiarTurno?.addEventListener("click", () => {
  if (!miTurno) return;
  modoReprogramacion = !modoReprogramacion;
  actualizarPanelReserva();
  generarCalendario();
  mostrarEstadoAgenda(
    modoReprogramacion
      ? "Elegí un nuevo horario. Tu turno actual se mantiene hasta que confirmes el cambio."
      : "Cancelaste el cambio. Tu turno actual se mantiene sin modificaciones.",
    "info",
  );
  if (modoReprogramacion) calendario.scrollIntoView({ behavior: "smooth", block: "start" });
});

botonCancelarTurno?.addEventListener("click", () => {
  if (!miTurno || modalTurno.open || modalCancelacion.open) return;
  textoTurnoCancelacion.textContent = `${miTurno.fechaVisible} · ${miTurno.hora} hs`;
  modalCancelacion.showModal();
  document.body.classList.add("modal-open");
  modalCancelacion.querySelector("[data-close-cancel]")?.focus();
});

function cerrarModalCancelacion() {
  if (modalCancelacion.open) modalCancelacion.close();
}
document.querySelectorAll("[data-close-cancel]").forEach((b) => b.addEventListener("click", cerrarModalCancelacion));
modalCancelacion.addEventListener("click", (e) => {
  if (e.target === modalCancelacion) cerrarModalCancelacion();
});
modalCancelacion.addEventListener("close", () => {
  if (!modalTurno.open) document.body.classList.remove("modal-open");
});

// Cancela con tu token: la fila queda como historial, el slot se libera.
botonConfirmarCancelacion?.addEventListener("click", async () => {
  if (!miTurno) {
    cerrarModalCancelacion();
    return;
  }
  const cancelada = { ...miTurno };
  const { codigoError } = await llamarRpc("cancelar_con_token", { p_id: cancelada.id, p_token: cancelada.token });
  if (codigoError) {
    mostrarEstadoAgenda("No pudimos cancelar. Revisá tu conexión e intentá de nuevo.", "error");
    cerrarModalCancelacion();
    return;
  }
  guardarMiTurno(null);
  ocupados.delete(llaveSlot(cancelada.fecha, cancelada.hora));
  modoReprogramacion = false;
  cerrarModalCancelacion();
  actualizarPanelReserva();
  generarCalendario();
  mostrarEstadoAgenda(`Cancelaste el turno del ${cancelada.fechaVisible} a las ${cancelada.hora} hs.`, "exito");
  estadoAgenda.scrollIntoView({ behavior: "smooth", block: "center" });
});

formularioTurno.addEventListener("invalid", () => {
  mostrarErrorFormulario("Revisá los campos marcados antes de solicitar el turno.");
}, true);

const MENSAJES_RPC = {
  SLOT_OCUPADO: "Ese horario se acaba de ocupar desde otro celu. Elegí otro turno.",
  TOPE_POR_TELEFONO: "Ya tenés 3 turnos activos con ese teléfono. Cancelá uno antes.",
  DOMINGO_CERRADO: "Los domingos estamos cerrados. Elegí otro día.",
  FECHA_PASADA: "Ese horario ya pasó. Elegí otro turno.",
  SLOT_NO_HABILITADO: "Ese horario no está habilitado. Elegí otro turno.",
  FUERA_DE_VENTANA: "Solo mostramos los próximos días abiertos.",
  PAYLOAD_INVALIDO: "Ingresá tu nombre y apellido, y un celular uruguayo que comience con 09.",
  IDEMPOTENCY_KEY_REUSED: "Ese pedido ya se procesó. Revisá tu turno arriba.",
  TOKEN_INVALIDO_O_ESTADO_FINAL: "Tu turno cambió de estado. Recargá la página.",
  SIN_NUBE: "Sin conexión a la nube: revisá js/supabase-client.js.",
};

// Crear o cambiar: UNA sola RPC atómica. Reintentar SOLO con mismos ids
// (request_id/token ya generados) porque la operación es idempotente.
formularioTurno.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  if (enviandoFormulario) return;
  ocultarErrorFormulario();

  if (!turnoSeleccionado || !campoFecha.value || !campoHora.value ||
      campoFecha.value !== turnoSeleccionado.fecha || campoHora.value !== turnoSeleccionado.hora ||
      ocupados.has(turnoSeleccionado.llave)) {
    mostrarEstadoAgenda("Ese horario ya no está disponible. Elegí otro turno.", "error");
    cerrarFormularioTurno();
    generarCalendario();
    calendario.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const formularioValido =
    globalThis.ValidacionReserva?.validarFormulario(formularioTurno) ?? formularioTurno.checkValidity();
  if (!formularioValido) {
    mostrarErrorFormulario("Ingresá tu nombre y apellido, y un celular uruguayo que comience con 09.");
    formularioTurno.reportValidity();
    formularioTurno.querySelector(":invalid")?.focus();
    return;
  }

  enviandoFormulario = true;
  botonEnviar.disabled = true;
  botonEnviar.setAttribute("aria-busy", "true");

  const esCambio = Boolean(miTurno && modoReprogramacion);
  const anterior = miTurno ? { ...miTurno } : null;
  // Secretos generados ANTES de llamar: si la respuesta se pierde,
  // reintentamos con los mismos (idempotente) y nada se duplica.
  const reqId = crypto.randomUUID();
  const tok = crypto.randomUUID();

  let fila = null;
  let codigoError = null;
  if (esCambio) {
    ({ fila, codigoError } = await llamarRpc("cambiar_con_token", {
      p_id: anterior.id,
      p_token: anterior.token,
      p_nueva_fecha: turnoSeleccionado.fecha,
      p_nueva_hora: turnoSeleccionado.hora,
      p_request_id: reqId,
      p_new_cancel_token: tok,
    }));
  } else {
    ({ fila, codigoError } = await llamarRpc("crear_reserva", {
      p_fecha: turnoSeleccionado.fecha,
      p_hora: turnoSeleccionado.hora,
      p_nombre: campoNombre.value.trim(),
      p_telefono: campoTelefono.value,
      p_request_id: reqId,
      p_cancel_token: tok,
    }));
  }

  if (codigoError || !fila) {
    restablecerBotonEnviar();
    // Si el código no está en el mapa, mostrarlo igual: así se puede diagnosticar.
    mostrarEstadoAgenda(
      MENSAJES_RPC[codigoError] ?? `No pude guardar (${codigoError}). Revisá tu conexión e intentá de nuevo.`,
      "error",
    );
    ocupados.clear();
    await cargarDisponibilidad();
    generarCalendario();
    return;
  }

  guardarMiTurno({
    id: fila.o_id,
    token: tok,
    fecha: fila.o_fecha,
    hora: fila.o_hora,
    fechaVisible: turnoSeleccionado.fechaVisible,
    nombre: campoNombre.value.trim(),
    telefono: campoTelefono.value,
  });
  modoReprogramacion = false;
  document.dispatchEvent(new CustomEvent(esCambio ? "turno:cambiado" : "turno:solicitado", { detail: { id: fila.o_id } }));

  try {
    sessionStorage.removeItem("streetBarberPrefill");
  } catch { /* igual */ }
  datosIniciales.nombre = "";
  datosIniciales.telefono = "";
  formularioTurno.reset();
  campoNombre.setCustomValidity("");
  campoTelefono.setCustomValidity("");
  horarioSeleccionado = null;
  turnoSeleccionado = null;
  actualizarPanelReserva();
  ocupados.clear();
  await cargarDisponibilidad();
  generarCalendario();

  tituloConfirmacion.textContent = esCambio ? "¡Turno cambiado!" : "¡Turno solicitado!";
  mensajeConfirmacion.textContent = esCambio
    ? `Tu nuevo turno es el ${miTurno.fechaVisible} a las ${miTurno.hora} hs. El anterior quedó cancelado en el historial.`
    : `Solicitaste el ${miTurno.fechaVisible} a las ${miTurno.hora} hs. Te contactaremos para confirmar.`;
  mostrarEstadoAgenda(
    esCambio
      ? `Cambiaste tu turno al ${miTurno.fechaVisible} a las ${miTurno.hora} hs.`
      : `El horario ${miTurno.hora} del ${miTurno.fechaVisible} quedó reservado.`,
    "exito",
  );
  formularioTurno.hidden = true;
  confirmacionTurno.hidden = false;
  confirmacionTurno.querySelector("h2").focus();
});
