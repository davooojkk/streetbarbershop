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

function normalizarHora(hora) {
  const coincidencia = String(hora ?? "").match(/^([01][0-9]|2[0-3]):([0-5][0-9])/);
  return coincidencia ? `${coincidencia[1]}:${coincidencia[2]}` : "";
}

async function reconciliarReservaLocal(reserva) {
  if (!reserva?.id || !reserva?.token) return reserva;
  const cliente = globalThis.supabaseBarberia;
  if (!cliente || !window.supabase) return reserva;
  try {
    const { data, error } = await cliente.rpc("obtener_reserva_con_token", {
      p_id: reserva.id,
      p_token: reserva.token,
    });
    if (error) {
      const detalle = `${error.message ?? ""} ${error.details ?? ""}`;
      if (detalle.includes("TOKEN_INVALIDO") || detalle.includes("RESERVA_INEXISTENTE")) {
        localStorage.removeItem("streetBarberMiTurno");
        return null;
      }
      return reserva;
    }
    const fila = Array.isArray(data) ? data[0] : data;
    const hora = normalizarHora(fila?.o_hora);
    if (!fila || !["pendiente", "confirmado"].includes(fila.o_estado) || !hora) {
      localStorage.removeItem("streetBarberMiTurno");
      return null;
    }
    const actualizada = { ...reserva, fecha: fila.o_fecha, hora };
    localStorage.setItem("streetBarberMiTurno", JSON.stringify(actualizada));
    return actualizada;
  } catch {
    // Sin red conservamos el turno local: es más seguro que habilitar un duplicado.
    return reserva;
  }
}

// -- Dibujar la tarjetita: mi turno local o próximo libre según la nube --
// La nube es la autoridad (RPC hora+ocupado, sin PII). Se prueban días
// en orden hasta hallar hueco (normalmente 1-3 llamadas).
async function actualizarTarjetaReserva() {
  // Si no hay tarjeta o no se cargó la cajita de fechas, no hacemos nada.
  if (!tarjetaReserva || !globalThis.CalendarioFechas) {
    return;
  }

  const {
    crearFechaDesdeValor,
    diasSemana,
    formatearFechaLarga,
    turnoYaPaso,
  } = globalThis.CalendarioFechas;

  // Mi turno (si pedí uno en este celu y sigue vigente).
  let ultimaReserva = null;
  try {
    ultimaReserva = JSON.parse(localStorage.getItem("streetBarberMiTurno") ?? "null");
  } catch { /* sin storage no hay turno propio */ }
  if (ultimaReserva) {
    ultimaReserva.hora = normalizarHora(ultimaReserva.hora);
    ultimaReserva = await reconciliarReservaLocal(ultimaReserva);
  }

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

  // CASO 2: no tengo turno → preguntar a la nube día por día.
  const proximoTurno = await buscarProximoLibre();

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

// Recorre los próximos 60 días abiertos y devuelve el primer hueco
// (hora no ocupada según la RPC y no pasada si es hoy). Null si no hay.
async function buscarProximoLibre() {
  const cliente = globalThis.supabaseBarberia;
  if (!cliente || !window.supabase) return null;
  const ahora = new Date();
  const dias = globalThis.CalendarioFechas.obtenerProximosDiasAbiertos(ahora, 60);
  // Se consulta en lotes pequeños: evita hasta 60 esperas consecutivas cuando
  // la agenda está llena, sin disparar todas las peticiones a la vez.
  for (let inicio = 0; inicio < dias.length; inicio += 5) {
    const lote = dias.slice(inicio, inicio + 5);
    let respuestas;
    try {
      respuestas = await Promise.all(lote.map(async (d) => {
        const fechaValor = globalThis.CalendarioFechas.formatearFechaValor(d);
        const res = await cliente.rpc("obtener_disponibilidad", { dia: fechaValor });
        if (res.error || !Array.isArray(res.data)) throw res.error ?? new Error("RESPUESTA_INVALIDA");
        return { d, fechaValor, filas: res.data };
      }));
    } catch {
      // No se anuncia un horario posterior si hay días anteriores sin confirmar.
      return null;
    }
    for (const respuesta of respuestas) {
      for (const h of respuesta.filas) {
        const hora = normalizarHora(h.hora);
        if (hora && !h.ocupado && !globalThis.CalendarioFechas.horarioYaPaso(respuesta.d, hora, ahora)) {
          return { fecha: respuesta.d, fechaValor: respuesta.fechaValor, hora };
        }
      }
    }
  }
  return null;
}

// Al abrir la página, dibujamos la tarjeta enseguida.
// El catch es red de seguridad: si algo raro pasa, mostramos CONSULTANOS
// en vez de dejar la promesa rota en silencio.
actualizarTarjetaReserva().catch(() => {
  const dia = tarjetaReserva?.querySelector("[data-booking-day]");
  const hora = tarjetaReserva?.querySelector("[data-booking-time]");
  if (dia) dia.textContent = "CONSULTANOS";
  if (hora) hora.textContent = "—";
});

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
