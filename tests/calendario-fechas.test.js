const assert = require("node:assert/strict");
const {
  formatearFechaValor,
  horarioYaPaso,
  obtenerIdTurno,
  obtenerProximoTurnoDisponible,
  obtenerProximosDiasAbiertos,
} = require("../js/calendario-fechas.js");

function fechasDesde(anio, mes, dia) {
  return obtenerProximosDiasAbiertos(new Date(anio, mes, dia, 12)).map(
    formatearFechaValor,
  );
}

assert.deepEqual(fechasDesde(2026, 8, 30), [
  "2026-09-30",
  "2026-10-01",
  "2026-10-02",
  "2026-10-03",
  "2026-10-05",
]);

assert.deepEqual(fechasDesde(2026, 11, 31), [
  "2026-12-31",
  "2027-01-01",
  "2027-01-02",
  "2027-01-04",
  "2027-01-05",
]);

assert.deepEqual(fechasDesde(2027, 0, 3), [
  "2027-01-04",
  "2027-01-05",
  "2027-01-06",
  "2027-01-07",
  "2027-01-08",
]);

assert.deepEqual(fechasDesde(2026, 9, 3), [
  "2026-10-03",
  "2026-10-05",
  "2026-10-06",
  "2026-10-07",
  "2026-10-08",
]);

const ahora = new Date(2026, 8, 29, 10, 30);
const hoy = new Date(2026, 8, 29);

assert.equal(horarioYaPaso(hoy, "10:00", ahora), true);
assert.equal(horarioYaPaso(hoy, "11:00", ahora), false);
assert.equal(
  obtenerIdTurno(new Date(2027, 0, 1), "08:00"),
  "2027-01-01|08:00",
);

const proximoHoy = obtenerProximoTurnoDisponible(
  new Date(2026, 8, 29, 16, 30),
);

assert.equal(proximoHoy.id, "2026-09-29|17:00");

const proximoSinPrimero = obtenerProximoTurnoDisponible(
  new Date(2026, 8, 30, 7, 0),
  new Set(["2026-09-30|08:00"]),
);

assert.equal(proximoSinPrimero.id, "2026-09-30|09:00");

const proximoDesdeDomingo = obtenerProximoTurnoDisponible(
  new Date(2027, 0, 3, 9, 0),
);

assert.equal(proximoDesdeDomingo.id, "2027-01-04|08:00");

console.log("Pruebas de calendario correctas.");
