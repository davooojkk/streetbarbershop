// ============================================================
// CALENDARIO: el cerebro de la página agenda.html
// ------------------------------------------------------------
// Imaginá esta página como una cartelera con botones de horarios.
// Este archivo hace todo:
// 1) Dibuja los próximos 5 días abiertos con sus horarios.
// 2) Abre la ventanita (modal) para pedir un turno.
// 3) Guarda, cambia o cancela tu turno (solo uno activo a la vez).
// 4) Muestra mensajes de éxito o error.
// Trabaja en equipo con calendario-fechas.js (fechas),
// reservas-temporales.js (memoria) y validacion.js (revisar datos).
// ============================================================

// -- Paso 1: pedir prestadas las herramientas de fechas --
// Es como sacar herramientas de una caja para usarlas aquí.
const {
  crearFechaDesdeValor,
  diasSemana,
  formatearFecha,
  formatearFechaLarga,
  formatearFechaValor,
  horarios,
  horarioYaPaso,
  obtenerIdTurno,
  obtenerProximosDiasAbiertos,
  turnoYaPaso,
} = globalThis.CalendarioFechas;

// -- Paso 2: buscar todos los carteles y botones de la página --
// "document.querySelector" = "buscame este elemento en el HTML".
// Guardamos cada uno en una variable para no buscarlo mil veces.
const calendario = document.querySelector("#calendario"); // la cartelera principal
const estadoAgenda = document.querySelector("#agenda-status"); // cartel de mensajes (éxito/error)
const modalTurno = document.querySelector("#booking-modal"); // ventanita para pedir turno
const formularioTurno = document.querySelector("#booking-form"); // formulario nombre + teléfono
const confirmacionTurno = document.querySelector("#booking-success"); // cartel de "¡listo!"
const mensajeConfirmacion = document.querySelector("#booking-success-message");
const textoFecha = document.querySelector("#turno-fecha"); // texto lindo de la fecha elegida
const textoHora = document.querySelector("#turno-hora"); // texto lindo de la hora elegida
const campoFecha = document.querySelector("#turno-fecha-value"); // campo oculto con fecha
const campoHora = document.querySelector("#turno-hora-value"); // campo oculto con hora
const campoNombre = document.querySelector("#turno-nombre");
const campoTelefono = document.querySelector("#turno-telefono");
const feedbackFormulario = document.querySelector("#booking-form-feedback"); // cartel rojo de errores
const botonEnviar = document.querySelector("[data-submit-turno]");
const etiquetaBotonEnviar = document.querySelector("[data-submit-label]");
const textoSuperiorModal = document.querySelector("[data-modal-eyebrow]");
const tituloModal = document.querySelector("#booking-modal-title");
const tituloConfirmacion = document.querySelector("[data-success-title]");
const reservaActivaPanel = document.querySelector("#active-booking"); // cartel superior "tu reserva"
const reservaActivaFecha = document.querySelector("#active-booking-date");
const reservaActivaDia = document.querySelector("#active-booking-day");
const reservaActivaHora = document.querySelector("#active-booking-time");
const botonCambiarTurno = document.querySelector("[data-change-turno]");
const botonCancelarTurno = document.querySelector("[data-cancel-turno]");
const modalCancelacion = document.querySelector("#cancel-modal"); // ventanita "¿seguro cancelar?"
const textoTurnoCancelacion = document.querySelector("#cancel-modal-turn");
const botonConfirmarCancelacion = document.querySelector("[data-confirm-cancel]");

// -- Paso 3: memoria de lo que está pasando ahora --
const almacenReservas = globalThis.ReservasTemporales;
const turnosReservados = almacenReservas?.obtenerIds() ?? new Set(); // lista de ocupados
let reservaActiva = almacenReservas?.obtenerUltimaReserva() ?? null; // mi turno actual (o null)
let turnoSeleccionado = null; // el horario que acabo de tocar (todavía no confirmado)
let horarioSeleccionado = null; // el botón que toqué (para pintarlo distinto)
let enviandoFormulario = false; // candado para no enviar 2 veces seguidas
let modoReprogramacion = false; // true cuando estoy cambiando mi turno por otro

// -- Paso 4: datos que vienen de la página principal --
// Si en index.html escribiste tu nombre, lo traemos para no pedirlo de nuevo.
const datosIniciales = {
  nombre: "",
  telefono: "",
};

try {
  // Intentamos leer lo que home.js guardó en la memoria de la pestaña.
  const datosGuardados = JSON.parse(
    sessionStorage.getItem("streetBarberPrefill") ?? "null",
  );

  if (datosGuardados && typeof datosGuardados === "object") {
    datosIniciales.nombre = datosGuardados.nombre ?? "";
    datosIniciales.telefono = datosGuardados.telefono ?? "";
  }
} catch {
  // La agenda sigue disponible aunque el navegador bloquee sessionStorage.
}

// También aceptamos datos que vengan en la dirección web (?nombre=...).
// Es el plan B por si la memoria de arriba falló.
const parametros = new URLSearchParams(window.location.search);

datosIniciales.nombre ||= parametros.get("nombre") ?? "";
datosIniciales.telefono ||= parametros.get("telefono") ?? "";

// Si la dirección traía datos, la limpiamos para que no se vean tus datos.
// Ejemplo: "agenda.html?nombre=Ana" → "agenda.html#calendario".
if (parametros.size > 0) {
  try {
    history.replaceState(null, "", `${window.location.pathname}#calendario`);
  } catch {
    // Abrir el archivo directamente no impide utilizar la agenda.
  }
}

// -- ¿Mi reserva guardada todavía vale? --
// Una reserva vieja (ej: ayer a las 10) ya no vale. Devuelve true/false.
function reservaSigueVigente(reserva, ahora = new Date()) {
  const fecha = reserva?.fecha
    ? crearFechaDesdeValor(reserva.fecha)
    : null;

  return Boolean(
    fecha && reserva?.hora && !turnoYaPaso(fecha, reserva.hora, ahora),
  );
}

// Si al abrir la página mi reserva ya venció, la borramos para liberar el horario.
if (reservaActiva && !reservaSigueVigente(reservaActiva)) {
  turnosReservados.delete(reservaActiva.id);
  almacenReservas?.cancelar(reservaActiva.id);
  reservaActiva = null;
}

// -- Dibujar el cartel superior "TU RESERVA" (o esconderlo si no tengo) --
function actualizarPanelReserva() {
  if (!reservaActivaPanel) {
    return;
  }

  // Sin reserva vigente → esconder el cartel.
  if (!reservaActiva || !reservaSigueVigente(reservaActiva)) {
    reservaActivaPanel.hidden = true;
    reservaActivaPanel.classList.remove("active-booking--changing");
    return;
  }

  // Con reserva → mostrar fecha y hora, y cambiar el botón según el modo.
  const fecha = crearFechaDesdeValor(reservaActiva.fecha);

  reservaActivaPanel.hidden = false;
  reservaActivaPanel.classList.toggle(
    "active-booking--changing",
    modoReprogramacion,
  );
  reservaActivaDia.textContent = formatearFechaLarga(fecha);
  reservaActivaHora.textContent = `${reservaActiva.hora} hs`;
  reservaActivaFecha.dateTime = `${reservaActiva.fecha}T${reservaActiva.hora}`;
  botonCambiarTurno.textContent = modoReprogramacion
    ? "CANCELAR CAMBIO"
    : "CAMBIAR TURNO";
}

// -- Cambiar los títulos de la ventanita según lo que estoy haciendo --
// No es lo mismo pedir un turno nuevo que cambiar el que ya tengo.
function configurarModalReserva() {
  const cambiando = Boolean(reservaActiva && modoReprogramacion);

  textoSuperiorModal.textContent = cambiando
    ? "ELEGISTE UN NUEVO HORARIO"
    : "COMPLETÁ TUS DATOS";
  tituloModal.textContent = cambiando ? "Cambiá tu turno" : "Reservá tu turno";
  etiquetaBotonEnviar.textContent = cambiando
    ? "CONFIRMAR CAMBIO"
    : "QUIERO MI TURNO";
}

// -- Mostrar un mensaje en la cartelera (verde de éxito, rojo de error, etc.) --
function mostrarEstadoAgenda(mensaje, tipo = "info") {
  estadoAgenda.textContent = mensaje;
  estadoAgenda.dataset.tipo = tipo;
  estadoAgenda.hidden = !mensaje;
}

// -- Mostrar / esconder el cartelito rojo dentro del formulario --
function mostrarErrorFormulario(mensaje) {
  feedbackFormulario.textContent = mensaje;
  feedbackFormulario.hidden = false;
}

function ocultarErrorFormulario() {
  feedbackFormulario.textContent = "";
  feedbackFormulario.hidden = true;
}

// -- Devolver el botón de enviar a su estado normal (habilitado) --
function restablecerBotonEnviar() {
  enviandoFormulario = false;
  botonEnviar.disabled = false;
  botonEnviar.removeAttribute("aria-busy");
}

// -- Averiguar en qué estado está un horario --
// Respuestas posibles:
// - "propio": es MI turno actual.
// - "ocupado": lo pidió alguien (o yo en esta memoria).
// - "pasado": la hora ya pasó hoy.
// - "seleccionado": lo acabo de tocar.
// - "disponible": libre para pedir.
function obtenerEstadoTurno(fecha, hora, ahora = new Date()) {
  const idTurno = obtenerIdTurno(fecha, hora);

  if (reservaActiva?.id === idTurno && reservaSigueVigente(reservaActiva, ahora)) {
    return "propio";
  }

  if (turnosReservados.has(idTurno)) {
    return "ocupado";
  }

  if (horarioYaPaso(fecha, hora, ahora)) {
    return "pasado";
  }

  if (turnoSeleccionado?.id === idTurno) {
    return "seleccionado";
  }

  return "disponible";
}

// -- Cuando tocás un horario: abrir la ventanita para pedirlo --
function abrirFormularioTurno(fecha, hora, boton) {
  const idTurno = obtenerIdTurno(fecha, hora);
  const estadoTurno = obtenerEstadoTurno(fecha, hora);

  // Freno de seguridad: si la ventanita ya está abierta, el botón está
  // apagado, o el turno no está libre, no hacemos nada.
  if (
    modalTurno.open ||
    boton.disabled ||
    (estadoTurno !== "disponible" && estadoTurno !== "seleccionado")
  ) {
    return;
  }

  // Regla de oro: solo 1 turno activo. Si ya tenés uno y no estás en modo
  // "cambiar", te mandamos al cartel superior en vez de abrir el formulario.
  if (reservaActiva && !modoReprogramacion) {
    mostrarEstadoAgenda(
      "Ya tenés un turno activo. Podés cambiarlo o cancelarlo desde el panel superior.",
      "info",
    );
    reservaActivaPanel?.scrollIntoView({ behavior: "smooth", block: "center" });
    botonCambiarTurno?.focus({ preventScroll: true });
    return;
  }

  // Guardamos qué turno elegiste, con su fecha linda para mostrar.
  turnoSeleccionado = {
    id: idTurno,
    fecha: formatearFechaValor(fecha),
    fechaVisible: formatearFechaLarga(fecha),
    hora,
  };

  // Pintamos el botón tocado como "seleccionado" y despintamos el anterior.
  horarioSeleccionado?.classList.remove("seleccionado");
  horarioSeleccionado?.setAttribute("aria-pressed", "false");
  horarioSeleccionado = boton;
  horarioSeleccionado.classList.add("seleccionado");
  horarioSeleccionado.dataset.estado = "seleccionado";
  horarioSeleccionado.setAttribute("aria-pressed", "true");
  horarioSeleccionado.setAttribute(
    "aria-label",
    `${turnoSeleccionado.fechaVisible}, ${hora}, seleccionado`,
  );

  // Preparamos el formulario: lo limpiamos, sacamos errores viejos,
  // y pre-llenamos nombre/teléfono si ya los sabemos.
  formularioTurno.reset();
  campoNombre.setCustomValidity("");
  campoTelefono.setCustomValidity("");
  campoNombre.value = modoReprogramacion
    ? reservaActiva?.nombre ?? datosIniciales.nombre
    : datosIniciales.nombre;
  campoTelefono.value = modoReprogramacion
    ? reservaActiva?.telefono ?? datosIniciales.telefono
    : datosIniciales.telefono;
  formularioTurno.hidden = false;
  confirmacionTurno.hidden = true;
  ocultarErrorFormulario();
  restablecerBotonEnviar();
  configurarModalReserva();

  // Mostramos en la ventanita qué día y hora elegiste.
  textoFecha.textContent = turnoSeleccionado.fechaVisible;
  textoHora.textContent = `${hora} hs`;
  campoFecha.value = turnoSeleccionado.fecha;
  campoHora.value = turnoSeleccionado.hora;

  // Abrimos la ventanita y llevamos el cursor al campo nombre.
  modalTurno.showModal();
  document.body.classList.add("modal-open");
  campoNombre.focus();
}

// -- Cerrar la ventanita de pedir turno --
function cerrarFormularioTurno() {
  if (modalTurno.open) {
    modalTurno.close();
  }
}

// -- Dibujar toda la cartelera: 5 días con sus botones de horarios --
// Esta es la función más importante: crea las columnas de días y los botones.
// Los horarios que ya pasaron no se dibujan. Los ocupados se dibujan apagados.
function generarCalendario(ahora = new Date()) {
  calendario.innerHTML = "";

  const dias = obtenerProximosDiasAbiertos(ahora, 5);

  dias.forEach((fecha) => {
    // Creamos los elementos nuevos desde cero (columna, título, fecha, caja de botones).
    const columna = document.createElement("section");
    const nombreDia = document.createElement("h3");
    const fechaTexto = document.createElement("time");
    const contenedorHorarios = document.createElement("div");
    const idDia = `dia-${formatearFechaValor(fecha)}`;
    let cantidadHorarios = 0;

    columna.classList.add("dia");
    columna.setAttribute("aria-labelledby", idDia);

    nombreDia.id = idDia;
    nombreDia.textContent = diasSemana[fecha.getDay()];

    fechaTexto.classList.add("fecha");
    fechaTexto.dateTime = formatearFechaValor(fecha);
    fechaTexto.textContent = formatearFecha(fecha);

    contenedorHorarios.classList.add("horarios");

    // Por cada hora del día (08:00, 09:00...), creamos un botón.
    horarios.forEach((hora) => {
      const estadoTurno = obtenerEstadoTurno(fecha, hora, ahora);

      // Los horarios pasados de hoy no se muestran (la consigna lo pide).
      if (estadoTurno === "pasado") {
        return;
      }

      const boton = document.createElement("button");
      const idTurno = obtenerIdTurno(fecha, hora);
      const descripcionFecha = formatearFechaLarga(fecha);

      cantidadHorarios += 1;
      boton.classList.add("horario");
      boton.type = "button";
      boton.dataset.estado = estadoTurno;
      boton.dataset.turnoId = idTurno;

      // Botones apagados: ocupados o el mío. Muestran "OCUPADO" / "TU TURNO".
      if (estadoTurno === "ocupado" || estadoTurno === "propio") {
        const horaTurno = document.createElement("span");
        const estadoTexto = document.createElement("small");

        horaTurno.textContent = hora;
        estadoTexto.textContent =
          estadoTurno === "propio" ? "TU TURNO" : "OCUPADO";
        boton.append(horaTurno, estadoTexto);
        boton.disabled = true;
        boton.classList.add(estadoTurno);
        boton.setAttribute(
          "aria-label",
          `${descripcionFecha}, ${hora}, ${estadoTurno === "propio" ? "tu turno" : "ocupado"}`,
        );
      } else {
        // Botones libres: se pueden tocar para abrir el formulario.
        boton.textContent = hora;
        boton.setAttribute(
          "aria-label",
          `${descripcionFecha}, ${hora}, ${estadoTurno}`,
        );
        boton.setAttribute(
          "aria-pressed",
          estadoTurno === "seleccionado" ? "true" : "false",
        );

        if (estadoTurno === "seleccionado") {
          boton.classList.add("seleccionado");
        }

        boton.addEventListener("click", () => {
          abrirFormularioTurno(fecha, hora, boton);
        });
      }

      contenedorHorarios.appendChild(boton);
    });

    // Si un día se quedó sin botones (todo pasó), mostramos un cartelito.
    if (cantidadHorarios === 0) {
      const sinHorarios = document.createElement("p");

      sinHorarios.classList.add("dia__vacio");
      sinHorarios.textContent = "Sin horarios disponibles por hoy.";
      contenedorHorarios.appendChild(sinHorarios);
    }

    columna.append(nombreDia, fechaTexto, contenedorHorarios);
    calendario.appendChild(columna);
  });
}

// -- Arranque: al abrir la página dibujamos todo una vez --
actualizarPanelReserva();
generarCalendario();

// -- Botones "X" para cerrar la ventanita --
document.querySelectorAll("[data-close-modal]").forEach((boton) => {
  boton.addEventListener("click", cerrarFormularioTurno);
});

// Si tocás fuera de la tarjeta (el fondo oscuro), también se cierra.
modalTurno.addEventListener("click", (evento) => {
  if (evento.target === modalTurno) {
    cerrarFormularioTurno();
  }
});

// -- Cuando se cierra la ventanita: limpiar todo --
// Despintamos el botón, olvidamos el turno tocado, limpiamos errores
// y dejamos el botón de enviar habilitado para la próxima vez.
modalTurno.addEventListener("close", () => {
  if (!modalCancelacion.open) {
    document.body.classList.remove("modal-open");
  }
  horarioSeleccionado?.classList.remove("seleccionado");
  horarioSeleccionado?.setAttribute("aria-pressed", "false");

  if (horarioSeleccionado) {
    horarioSeleccionado.dataset.estado = "disponible";
    horarioSeleccionado.setAttribute(
      "aria-label",
      `${turnoSeleccionado?.fechaVisible ?? "Turno"}, ${turnoSeleccionado?.hora ?? ""}, disponible`,
    );
  }

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

// -- Botón "CAMBIAR TURNO": entrar/salir del modo cambio --
botonCambiarTurno?.addEventListener("click", () => {
  if (!reservaActiva) {
    return;
  }

  modoReprogramacion = !modoReprogramacion;
  actualizarPanelReserva();
  generarCalendario();

  mostrarEstadoAgenda(
    modoReprogramacion
      ? "Elegí un nuevo horario. Tu turno actual se mantiene hasta que confirmes el cambio."
      : "Cancelaste el cambio. Tu turno actual se mantiene sin modificaciones.",
    "info",
  );

  if (modoReprogramacion) {
    calendario.scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

// -- Botón "CANCELAR TURNO": abrir la ventanita de confirmación --
botonCancelarTurno?.addEventListener("click", () => {
  if (!reservaActiva || modalTurno.open || modalCancelacion.open) {
    return;
  }

  textoTurnoCancelacion.textContent =
    `${reservaActiva.fechaVisible} · ${reservaActiva.hora} hs`;
  modalCancelacion.showModal();
  document.body.classList.add("modal-open");
  modalCancelacion.querySelector("[data-close-cancel]")?.focus();
});

// -- Cerrar la ventanita de cancelación --
function cerrarModalCancelacion() {
  if (modalCancelacion.open) {
    modalCancelacion.close();
  }
}

document.querySelectorAll("[data-close-cancel]").forEach((boton) => {
  boton.addEventListener("click", cerrarModalCancelacion);
});

modalCancelacion.addEventListener("click", (evento) => {
  if (evento.target === modalCancelacion) {
    cerrarModalCancelacion();
  }
});

modalCancelacion.addEventListener("close", () => {
  if (!modalTurno.open) {
    document.body.classList.remove("modal-open");
  }
});

// -- Botón rojo "SÍ, CANCELAR": borrar mi turno de verdad --
botonConfirmarCancelacion?.addEventListener("click", () => {
  if (!reservaActiva) {
    cerrarModalCancelacion();
    return;
  }

  const reservaCancelada = { ...reservaActiva };

  if (!almacenReservas?.cancelar(reservaCancelada.id)) {
    mostrarEstadoAgenda(
      "No pudimos cancelar el turno. Recargá la página e intentá nuevamente.",
      "error",
    );
    cerrarModalCancelacion();
    return;
  }

  turnosReservados.delete(reservaCancelada.id);
  reservaActiva = null;
  modoReprogramacion = false;
  cerrarModalCancelacion();
  actualizarPanelReserva();
  generarCalendario();
  mostrarEstadoAgenda(
    `Cancelaste el turno del ${reservaCancelada.fechaVisible} a las ${reservaCancelada.hora} hs. El horario volvió a quedar disponible.`,
    "exito",
  );
  estadoAgenda.scrollIntoView({ behavior: "smooth", block: "center" });
});

// -- Si el formulario tiene errores, mostrar el cartel rojo --
formularioTurno.addEventListener(
  "invalid",
  () => {
    mostrarErrorFormulario(
      "Revisá los campos marcados antes de solicitar el turno.",
    );
  },
  true,
);

// -- Cuando apretás "QUIERO MI TURNO": validar y guardar --
formularioTurno.addEventListener("submit", (evento) => {
  evento.preventDefault();

  // Candado: si ya estamos enviando, ignoramos el segundo clic.
  if (enviandoFormulario) {
    return;
  }

  ocultarErrorFormulario();

  // Verificamos que el turno tocado siga siendo el mismo y siga libre.
  // Si alguien lo ocupó mientras llenabas el formulario, te avisamos.
  if (
    !turnoSeleccionado ||
    !campoFecha.value ||
    !campoHora.value ||
    campoFecha.value !== turnoSeleccionado.fecha ||
    campoHora.value !== turnoSeleccionado.hora ||
    turnosReservados.has(turnoSeleccionado.id)
  ) {
    mostrarEstadoAgenda(
      "Ese horario ya no está disponible. Elegí otro turno.",
      "error",
    );
    cerrarFormularioTurno();
    generarCalendario();
    calendario.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  // Revisamos nombre y teléfono con el "portero" de validacion.js.
  const formularioValido =
    globalThis.ValidacionReserva?.validarFormulario(formularioTurno) ??
    formularioTurno.checkValidity();

  if (!formularioValido) {
    mostrarErrorFormulario(
      "Ingresá un nombre válido y un celular uruguayo que comience con 09.",
    );
    formularioTurno.reportValidity();
    formularioTurno.querySelector(":invalid")?.focus();
    return;
  }

  // Apagamos el botón y mostramos que estamos trabajando (para lectores de pantalla).
  enviandoFormulario = true;
  botonEnviar.disabled = true;
  botonEnviar.setAttribute("aria-busy", "true");

  // Juntamos todos los datos del turno confirmado.
  const datosTurno = Object.fromEntries(new FormData(formularioTurno));
  const reservaAnterior = reservaActiva ? { ...reservaActiva } : null;
  const esCambio = Boolean(reservaAnterior && modoReprogramacion);
  const reservaConfirmada = {
    ...turnoSeleccionado,
    nombre: campoNombre.value,
    telefono: campoTelefono.value,
  };

  // Si es un cambio, liberamos el horario viejo y ocupamos el nuevo.
  if (esCambio) {
    turnosReservados.delete(reservaAnterior.id);
  }
  turnosReservados.add(reservaConfirmada.id);
  almacenReservas?.guardar(reservaConfirmada);
  reservaActiva = reservaConfirmada;
  modoReprogramacion = false;

  // Avisamos al resto de la página que algo pasó (por si quieren reaccionar).
  document.dispatchEvent(
    new CustomEvent(esCambio ? "turno:cambiado" : "turno:solicitado", {
      detail: datosTurno,
    }),
  );

  try {
    sessionStorage.removeItem("streetBarberPrefill");
  } catch {
    // La reserva temporal sigue funcionando aunque sessionStorage esté bloqueado.
  }

  // Limpiamos todo y volvemos a dibujar la cartelera con el nuevo estado.
  datosIniciales.nombre = "";
  datosIniciales.telefono = "";
  formularioTurno.reset();
  campoNombre.setCustomValidity("");
  campoTelefono.setCustomValidity("");
  horarioSeleccionado = null;
  turnoSeleccionado = null;
  actualizarPanelReserva();
  generarCalendario();

  // Mostramos el cartel verde de "¡listo!" con los detalles.
  tituloConfirmacion.textContent = esCambio
    ? "¡Turno cambiado!"
    : "¡Turno solicitado!";
  mensajeConfirmacion.textContent = esCambio
    ? `Tu nuevo turno es el ${reservaConfirmada.fechaVisible} a las ${reservaConfirmada.hora} hs. El horario anterior quedó liberado.`
    : `Solicitaste el ${reservaConfirmada.fechaVisible} a las ${reservaConfirmada.hora} hs. Te contactaremos para confirmar.`;
  mostrarEstadoAgenda(
    esCambio
      ? `Cambiaste tu turno al ${reservaConfirmada.fechaVisible} a las ${reservaConfirmada.hora} hs.`
      : `El horario ${reservaConfirmada.hora} del ${reservaConfirmada.fechaVisible} quedó reservado.`,
    "exito",
  );

  formularioTurno.hidden = true;
  confirmacionTurno.hidden = false;
  confirmacionTurno.querySelector("h2").focus();
});
