// ============================================================
// RESERVAS-TEMPORALES: la "libretita" donde anotamos tu turno
// ------------------------------------------------------------
// Imaginá un papelito que el navegador guarda por vos.
// Aquí se guarda UN solo turno activo (no se pueden pedir dos a la vez).
// Usa "sessionStorage": una memoria que se borra cuando cerrás la pestaña.
// Por eso se llama "temporal": no es una reserva final en un servidor,
// es solo para que la página recuerde lo que elegiste mientras navegás.
// ============================================================
(function crearAlmacenReservas(entorno) {
  // -- Nombres de los cajones donde guardamos cosas --
  // Son como etiquetas. Siempre usamos las mismas para no perdernos.
  const claveTurnos = "streetBarberTurnosReservados";
  const claveUltimaReserva = "streetBarberUltimaReserva";

  // -- Copias de seguridad en memoria --
  // Si el navegador bloquea el almacenamiento, seguimos trabajando
  // con estas copias mientras la página esté abierta.
  const memoriaTurnos = new Set();
  let memoriaUltimaReserva = null;

  // -- Leer algo guardado, sin que se rompa la página --
  // Intentamos leer y convertir el texto guardado a objeto.
  // Si algo falla (ej: el navegador lo bloqueó), devolvemos un valor alternativo.
  // El "try/catch" es como decir: "intentá esto, y si sale mal, no te caigas".
  function leerJson(clave, alternativa) {
    try {
      const valor = JSON.parse(sessionStorage.getItem(clave) ?? "null");

      return valor ?? alternativa;
    } catch {
      return alternativa;
    }
  }

  // -- Guardar algo como texto --
  // sessionStorage solo acepta texto, así que convertimos el objeto a texto (JSON).
  // Si falla, no pasa nada grave: seguimos con la copia en memoria.
  function escribirJson(clave, valor) {
    try {
      sessionStorage.setItem(clave, JSON.stringify(valor));
    } catch {
      // La copia en memoria mantiene el flujo disponible en esta página.
    }
  }

  // -- ¿Qué turnos están ocupados? --
  // Hoy solo guardamos el último turno, así que la lista tiene 0 o 1 elementos.
  // Devolvemos una copia nueva (new Set) para que nadie modifique
  // nuestra lista original sin querer desde afuera.
  function obtenerIds() {
    const ultimaReserva = obtenerUltimaReserva();

    memoriaTurnos.clear();

    if (ultimaReserva?.id) {
      memoriaTurnos.add(ultimaReserva.id);
    }

    return new Set(memoriaTurnos);
  }

  // -- ¿Cuál fue mi último turno pedido? --
  // Devuelve una copia del objeto guardado, o null si no hay ninguno.
  // Devolver copias (y no el original) evita que alguien lo cambie sin avisarnos.
  function obtenerUltimaReserva() {
    const almacenada = leerJson(claveUltimaReserva, memoriaUltimaReserva);

    if (!almacenada || typeof almacenada !== "object") {
      return null;
    }

    memoriaUltimaReserva = { ...almacenada };

    return { ...memoriaUltimaReserva };
  }

  // -- Anotar un turno nuevo --
  // Solo aceptamos la reserva si trae id + fecha + hora (lo mínimo necesario).
  // Si ya había otro turno distinto, lo borramos: regla de "un turno por persona".
  // Devuelve true si se guardó, false si faltaban datos.
  function guardar(reserva) {
    if (!reserva?.id || !reserva?.fecha || !reserva?.hora) {
      return false;
    }

    const reservaAnterior = obtenerUltimaReserva();

    if (reservaAnterior?.id && reservaAnterior.id !== reserva.id) {
      memoriaTurnos.delete(reservaAnterior.id);
    }

    memoriaTurnos.add(reserva.id);
    memoriaUltimaReserva = { ...reserva };
    escribirJson(claveTurnos, [...memoriaTurnos]);
    escribirJson(claveUltimaReserva, memoriaUltimaReserva);

    return true;
  }

  // -- Borrar el turno (cancelar) --
  // Si me pasás un id y no coincide con el guardado, no borro nada y devuelvo false.
  // Esto evita cancelar el turno de otra persona por error.
  // Si no me pasás id, borro el turno activo que haya (si hay uno).
  function cancelar(idReserva) {
    const reservaActual = obtenerUltimaReserva();

    if (!reservaActual?.id || (idReserva && reservaActual.id !== idReserva)) {
      return false;
    }

    memoriaTurnos.delete(reservaActual.id);
    memoriaUltimaReserva = null;
    escribirJson(claveTurnos, [...memoriaTurnos]);
    escribirJson(claveUltimaReserva, null);

    return true;
  }

  // -- Compartir estas 4 acciones con el resto de la página --
  // "freeze" congela el objeto para que nadie lo modifique sin querer.
  entorno.ReservasTemporales = Object.freeze({
    cancelar,
    guardar,
    obtenerIds,
    obtenerUltimaReserva,
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
