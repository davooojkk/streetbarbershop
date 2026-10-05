// ============================================================
// CALENDARIO-FECHAS: la "calculadora de fechas" de la barbería
// ------------------------------------------------------------
// Imaginá que este archivo es una cajita de herramientas.
// No dibuja nada en pantalla. Solo responde preguntas como:
// "¿Qué 5 días abrimos?", "¿Este horario ya pasó?", "¿Cómo se escribe la fecha?"
// Otros archivos (calendario.js y home.js) le piden ayuda cuando la necesitan.
// ============================================================
(function crearUtilidadesCalendario(entorno) {
  // -- Lista de nombres de los días --
  // El domingo es el número 0, el lunes el 1... hasta el sábado que es 6.
  // JavaScript cuenta los días así, entonces guardamos los nombres en ese orden.
  const diasSemana = [
    "Domingo",
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
  ];

  // -- Nombres cortos de los meses para mostrar en pantalla --
  // Ejemplo: en vez de mostrar "30/09", mostramos "30 sep" que se lee mejor.
  const meses = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic",
  ];

  // -- Horarios en los que la barbería atiende --
  // Son turnos de 1 hora, desde las 8 de la mañana hasta las 5 de la tarde.
  const horarios = [
    "08:00",
    "09:00",
    "10:00",
    "11:00",
    "12:00",
    "13:00",
    "14:00",
    "15:00",
    "16:00",
    "17:00",
  ];

  // -- Dejar solo la fecha, sin la hora --
  // Una fecha en JavaScript trae día + hora (ej: "hoy a las 15:30").
  // Para comparar días nos molesta la hora, así que creamos una copia
  // con la hora en cero (a la medianoche). Es como decir "solo me importa el día".
  function normalizarFecha(fecha) {
    return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  }

  // -- Fecha corta y linda: "30 sep" --
  // Recibe una fecha y devuelve texto corto para las tarjetitas del calendario.
  function formatearFecha(fecha) {
    return `${fecha.getDate()} ${meses[fecha.getMonth()]}`;
  }

  // -- Fecha para guardar y comparar: "2026-09-30" --
  // Las computadoras prefieren este formato (año-mes-día) porque se ordena bien.
  // Siempre usa 2 dígitos: enero es "01", no "1".
  function formatearFechaValor(fecha) {
    const anio = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, "0");
    const dia = String(fecha.getDate()).padStart(2, "0");

    return `${anio}-${mes}-${dia}`;
  }

  // -- Fecha larga para personas: "Miércoles, 30 sep" --
  // Junta el nombre del día con la fecha corta. Se usa en los carteles.
  function formatearFechaLarga(fecha) {
    return `${diasSemana[fecha.getDay()]}, ${formatearFecha(fecha)}`;
  }

  // -- Crear la "cédula" de un turno --
  // Cada turno necesita un nombre único. Lo armamos pegando fecha + hora.
  // Ejemplo: "2026-09-30|09:00". La barrita "|" solo separa las dos partes.
  function obtenerIdTurno(fecha, hora) {
    return `${formatearFechaValor(fecha)}|${hora}`;
  }

  // -- Buscar los próximos días abiertos (sin domingos) --
  // La barbería cierra los domingos (día 0), así que los saltamos.
  // Empezamos desde hoy y avanzamos día por día hasta juntar la cantidad pedida.
  // Normalmente pedimos 5 días para mostrar en la agenda.
  function obtenerProximosDiasAbiertos(desde = new Date(), cantidad = 5) {
    const dias = [];
    const fecha = normalizarFecha(desde);

    while (dias.length < cantidad) {
      // Si no es domingo, lo guardamos. Hacemos una copia con "new Date"
      // para no modificar sin querer el día que ya guardamos.
      if (fecha.getDay() !== 0) {
        dias.push(new Date(fecha));
      }

      // Avanzamos al día siguiente para seguir buscando.
      fecha.setDate(fecha.getDate() + 1);
    }

    return dias;
  }

  // -- ¿Son el mismo día? --
  // Compara día, mes y año. Ignora la hora.
  // Ejemplo: hoy a las 9 y hoy a las 18 son "el mismo día" → true.
  function esMismaFecha(fecha, otraFecha) {
    return (
      fecha.getDate() === otraFecha.getDate() &&
      fecha.getMonth() === otraFecha.getMonth() &&
      fecha.getFullYear() === otraFecha.getFullYear()
    );
  }

  // -- ¿Este horario de hoy ya pasó? --
  // Solo tiene sentido para turnos de HOY. Si es otro día, devuelve false
  // porque todavía no sabemos (un turno de mañana nunca "ya pasó").
  // Ejemplo: si son las 10:30, el turno de las 10:00 ya pasó → true.
  function horarioYaPaso(fecha, hora, ahora = new Date()) {
    if (!esMismaFecha(fecha, ahora)) {
      return false;
    }

    const partes = String(hora).match(/^([01][0-9]|2[0-3]):([0-5][0-9])$/);
    if (!partes) return true;
    // Separamos "10:30" en horas=10 y minutos=30.
    const horas = Number(partes[1]);
    const minutos = Number(partes[2]);
    const turno = new Date(
      fecha.getFullYear(),
      fecha.getMonth(),
      fecha.getDate(),
      horas,
      minutos,
    );

    return turno <= ahora;
  }

  // -- Convertir texto "2026-09-30" en fecha de verdad --
  // Lo necesitamos cuando leemos una reserva guardada (que está en texto).
  // Si el texto está mal escrito o es una fecha imposible (ej: 30 de febrero),
  // devolvemos null (que significa "no pude entenderlo").
  function crearFechaDesdeValor(valor) {
    const partes = String(valor).split("-").map(Number);

    if (
      partes.length !== 3 ||
      partes.some((parte) => !Number.isInteger(parte))
    ) {
      return null;
    }

    const [anio, mes, dia] = partes;
    // OJO: en JavaScript los meses van de 0 a 11, por eso restamos 1.
    const fecha = new Date(anio, mes - 1, dia);

    // Verificamos que la fecha creada coincida con lo pedido.
    // Esto atrapa casos como "2026-02-30" que JavaScript convertiría en marzo.
    if (
      fecha.getFullYear() !== anio ||
      fecha.getMonth() !== mes - 1 ||
      fecha.getDate() !== dia
    ) {
      return null;
    }

    return fecha;
  }

  // -- ¿Este turno (cualquier día) ya quedó en el pasado? --
  // Es la versión más estricta: arma la fecha completa con hora y compara con "ahora".
  // Si la fecha es inválida, por seguridad decimos que sí pasó (true)
  // para no mostrar un turno roto como disponible.
  function turnoYaPaso(fecha, hora, ahora = new Date()) {
    const partes = String(hora).match(/^([01][0-9]|2[0-3]):([0-5][0-9])$/);

    if (!fecha || Number.isNaN(fecha.getTime()) || !partes) {
      return true;
    }
    const horas = Number(partes[1]);
    const minutos = Number(partes[2]);

    const turno = new Date(
      fecha.getFullYear(),
      fecha.getMonth(),
      fecha.getDate(),
      horas,
      minutos,
    );

    return turno <= ahora;
  }

  // -- Buscar el próximo hueco libre --
  // Recorre día por día y hora por hora hasta encontrar uno que:
  // 1) no esté en la lista de ocupados, y 2) todavía no haya pasado.
  // Se usa en la página principal para decir "tu próximo turno es...".
  // Mira hasta 60 días adelante; si no hay nada, devuelve null.
  function obtenerProximoTurnoDisponible(
    desde = new Date(),
    turnosOcupados = new Set(),
    cantidadDias = 60,
  ) {
    const dias = obtenerProximosDiasAbiertos(desde, cantidadDias);

    for (const fecha of dias) {
      for (const hora of horarios) {
        const id = obtenerIdTurno(fecha, hora);

        if (!turnosOcupados.has(id) && !horarioYaPaso(fecha, hora, desde)) {
          return {
            fecha: new Date(fecha),
            fechaValor: formatearFechaValor(fecha),
            hora,
            id,
          };
        }
      }
    }

    return null;
  }

  // -- Empaquetar todo para compartir --
  // "freeze" significa congelar: nadie puede cambiar estas herramientas sin querer.
  const utilidades = Object.freeze({
    crearFechaDesdeValor,
    diasSemana,
    esMismaFecha,
    formatearFecha,
    formatearFechaLarga,
    formatearFechaValor,
    horarios,
    horarioYaPaso,
    obtenerIdTurno,
    obtenerProximoTurnoDisponible,
    obtenerProximosDiasAbiertos,
    turnoYaPaso,
  });

  // Lo guardamos en un lugar visible para toda la página (globalThis).
  entorno.CalendarioFechas = utilidades;

  // Este pedacito extra es solo para las pruebas automáticas con Node.js.
  // En el navegador no hace nada.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = utilidades;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
