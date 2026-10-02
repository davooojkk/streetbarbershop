// ============================================================
// HOME: lo que pasa en la página principal (index.html)
// ------------------------------------------------------------
// Este archivo hace 2 trabajos:
// 1) Actualiza la tarjetita "RESERVÁ TU CITA": muestra tu turno si ya pediste
//    uno, o el próximo turno libre si todavía no pediste nada.
// 2) Cuando completás nombre + teléfono y apretás "Elegir día",
//    guarda esos datos y te lleva a la agenda sin perderlos.
// ============================================================

// -- Buscar en la página los 2 elementos que nos importan --
// "querySelector" es como decirle al navegador: "buscame este cartel".
// Si no lo encuentra, devuelve null (nada).
const formularioContacto = document.querySelector(".appointment-form");
const tarjetaReserva = document.querySelector("[data-booking-card]");

// -- Dibujar la tarjetita con la info correcta --
function actualizarTarjetaReserva() {
  // Si no hay tarjeta o no se cargó la cajita de fechas, no hacemos nada.
  if (!tarjetaReserva || !globalThis.CalendarioFechas) {
    return;
  }

  // Pedimos prestadas las herramientas de fechas que ya explicamos en otro archivo.
  const {
    crearFechaDesdeValor,
    diasSemana,
    formatearFechaLarga,
    obtenerProximoTurnoDisponible,
    turnoYaPaso,
  } = globalThis.CalendarioFechas;

  // Preguntamos: ¿hay turnos ocupados? ¿guardé un turno antes?
  const almacenReservas = globalThis.ReservasTemporales;
  const turnosOcupados = almacenReservas?.obtenerIds() ?? new Set();
  const ultimaReserva = almacenReservas?.obtenerUltimaReserva();

  // Convertimos la fecha guardada (texto) en fecha de verdad para poder comparar.
  const fechaReservada = ultimaReserva
    ? crearFechaDesdeValor(ultimaReserva.fecha)
    : null;

  // "reservaVigente" = true solo si tengo una reserva Y todavía no pasó su hora.
  const reservaVigente =
    fechaReservada &&
    ultimaReserva?.hora &&
    !turnoYaPaso(fechaReservada, ultimaReserva.hora);

  // Buscamos los pedacitos de texto dentro de la tarjeta para cambiarlos.
  const textoSuperior = tarjetaReserva.querySelector("[data-booking-eyebrow]");
  const titulo = tarjetaReserva.querySelector("[data-booking-title]");
  const etiqueta = tarjetaReserva.querySelector("[data-booking-label]");
  const fecha = tarjetaReserva.querySelector("[data-booking-date]");
  const dia = tarjetaReserva.querySelector("[data-booking-day]");
  const hora = tarjetaReserva.querySelector("[data-booking-time]");
  const llamadaAccion = tarjetaReserva.querySelector("[data-booking-cta]");

  // CASO 1: ya tengo un turno que todavía vale → mostrar "¡GRACIAS! / TU TURNO".
  if (reservaVigente) {
    tarjetaReserva.classList.add("booking-card--reserved");
    textoSuperior.textContent = "TU TURNO";
    titulo.textContent = "¡GRACIAS!";
    etiqueta.textContent = etiqueta.dataset.reservedText;
    dia.textContent = diasSemana[fechaReservada.getDay()].toUpperCase();
    hora.textContent = `${ultimaReserva.hora} hs`;
    llamadaAccion.textContent = "VER MI TURNO";
    fecha.dateTime = `${ultimaReserva.fecha}T${ultimaReserva.hora}`;
    fecha.setAttribute(
      "aria-label",
      `Turno solicitado para el ${formatearFechaLarga(fechaReservada)} a las ${ultimaReserva.hora}`,
    );
    return;
  }

  // CASO 2: no tengo turno → buscar el próximo horario libre.
  const proximoTurno = obtenerProximoTurnoDisponible(
    new Date(),
    turnosOcupados,
  );

  // Volvemos la tarjeta a su estado normal ("AGENDATE YA").
  tarjetaReserva.classList.remove("booking-card--reserved");
  textoSuperior.textContent = "RESERVÁ TU CITA";
  titulo.textContent = "¡AGENDATE YA!";
  etiqueta.textContent = "PRÓXIMO TURNO DISPONIBLE";
  llamadaAccion.textContent = "RESERVAR AHORA";

  // Si no hay ningún turno en 60 días, mostramos "CONSULTANOS".
  if (!proximoTurno) {
    dia.textContent = "CONSULTANOS";
    hora.textContent = "—";
    fecha.removeAttribute("datetime");
    fecha.setAttribute("aria-label", "No hay turnos disponibles por el momento");
    return;
  }

  // Si encontramos turno, lo mostramos: día en mayúsculas + hora.
  dia.textContent = diasSemana[proximoTurno.fecha.getDay()].toUpperCase();
  hora.textContent = `${proximoTurno.hora} hs`;
  fecha.dateTime = `${proximoTurno.fechaValor}T${proximoTurno.hora}`;
  fecha.setAttribute(
    "aria-label",
    `Próximo turno disponible: ${formatearFechaLarga(proximoTurno.fecha)} a las ${proximoTurno.hora}`,
  );
}

// Al abrir la página, dibujamos la tarjeta enseguida.
actualizarTarjetaReserva();

// -- Cuando enviás el formulario de "Quiero ser cliente" --
formularioContacto?.addEventListener("submit", (evento) => {
  // Primero revisamos que nombre y teléfono estén bien escritos.
  const formularioValido =
    globalThis.ValidacionReserva?.validarFormulario(formularioContacto) ??
    formularioContacto.checkValidity();

  // Si están mal, frenamos el envío y mostramos los errores.
  if (!formularioValido) {
    evento.preventDefault();
    formularioContacto.reportValidity();
    return;
  }

  // Juntamos los datos escritos (nombre + teléfono) en un objeto.
  const datos = Object.fromEntries(new FormData(formularioContacto));

  try {
    // Los guardamos en la memoria de la pestaña para pre-llenarlos en la agenda.
    sessionStorage.setItem("streetBarberPrefill", JSON.stringify(datos));

    // Frenamos el envío normal y vamos a la agenda. Usamos "#calendario"
    // para que la página baje directo al calendario.
    evento.preventDefault();
    window.location.assign(`${formularioContacto.action}#calendario`);
  } catch {
    // Sin sessionStorage se mantiene el envío GET nativo como alternativa.
  }
});
