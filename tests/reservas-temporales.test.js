const assert = require("node:assert/strict");

const almacenamiento = new Map();

global.sessionStorage = {
  getItem(clave) {
    return almacenamiento.get(clave) ?? null;
  },
  setItem(clave, valor) {
    almacenamiento.set(clave, valor);
  },
};

require("../js/reservas-temporales.js");

const reserva = {
  id: "2026-09-30|09:00",
  fecha: "2026-09-30",
  fechaVisible: "Miércoles, 30 sep",
  hora: "09:00",
};

assert.equal(global.ReservasTemporales.guardar(reserva), true);
assert.equal(
  global.ReservasTemporales.obtenerIds().has("2026-09-30|09:00"),
  true,
);
assert.deepEqual(global.ReservasTemporales.obtenerUltimaReserva(), reserva);

const reservaReprogramada = {
  id: "2026-10-01|10:00",
  fecha: "2026-10-01",
  fechaVisible: "Jueves, 1 oct",
  hora: "10:00",
};

assert.equal(global.ReservasTemporales.guardar(reservaReprogramada), true);
assert.equal(
  global.ReservasTemporales.obtenerIds().has("2026-09-30|09:00"),
  false,
);
assert.equal(
  global.ReservasTemporales.obtenerIds().has("2026-10-01|10:00"),
  true,
);
assert.deepEqual(
  global.ReservasTemporales.obtenerUltimaReserva(),
  reservaReprogramada,
);

assert.equal(
  global.ReservasTemporales.cancelar("2026-09-30|09:00"),
  false,
);
assert.equal(
  global.ReservasTemporales.cancelar("2026-10-01|10:00"),
  true,
);
assert.equal(global.ReservasTemporales.obtenerIds().size, 0);
assert.equal(global.ReservasTemporales.obtenerUltimaReserva(), null);

console.log("Pruebas de reservas temporales correctas.");
