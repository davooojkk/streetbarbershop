const assert = require("node:assert/strict");
const {
  esNombreValido,
  esTelefonoValido,
  normalizarNombre,
  normalizarTelefono,
} = require("../js/validacion.js");

assert.equal(normalizarNombre("  María   José  "), "María José");
assert.equal(esNombreValido("Juan Pérez"), true);
assert.equal(esNombreValido("Ana O'Neill"), true);
assert.equal(esNombreValido("Jean-Luc Picard"), true);
assert.equal(esNombreValido("Juan"), false);
assert.equal(esNombreValido("Juan 123"), false);
assert.equal(esNombreValido("Juan | Pérez"), false);

assert.equal(normalizarTelefono("09-123-4567"), "091234567");
assert.equal(esTelefonoValido("091234567"), true);
assert.equal(esTelefonoValido("291234567"), false);
assert.equal(esTelefonoValido("09123456"), false);

console.log("Pruebas de validación correctas.");
