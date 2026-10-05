// ============================================================
// VALIDACIÓN: el "portero" que revisa nombre y celular
// ------------------------------------------------------------
// Antes de aceptar una reserva, revisamos que los datos tengan sentido:
// - Nombre y apellido obligatorios: dos palabras o más, solo letras,
//   total 2 a 60 letras. Acepta tildes y ñ. Ej: "Juan Pérez".
// - Celular: uruguayo, 9 números, que empiece con 09. Ej: 091234567.
// Si algo está mal, mostramos un mensaje amable y no dejamos avanzar.
// ============================================================

// -- El molde del celular uruguayo --
// Esta línea rara se llama "expresión regular": es un molde.
// Se lee así: /^09[0-9]{7}$/ = "empieza con 09 y después 7 números más".
const patronTelefonoUruguayo = /^09[0-9]{7}$/;

// -- El molde del nombre y apellido (OBLIGATORIO los dos) --
// Se lee así: "palabra, espacio, palabra (y las que sigan)".
// Cada palabra empieza con letra y sigue con letras, ' o -.
// La "u" del final permite tildes y ñ. El largo 2-60 se revisa aparte.
const patronNombrePersona = /^[\p{L}][\p{L}'-]*(\s+[\p{L}][\p{L}'-]*)+$/u;

// -- Limpiar el nombre --
// Saca espacios del inicio/fin y convierte espacios dobles en uno solo.
// Ejemplo: "  Juan   Pérez  " → "Juan Pérez".
function normalizarNombre(valor) {
  return String(valor ?? "").trim().replace(/\s+/g, " ");
}

function esNombreValido(valor) {
  const nombre = normalizarNombre(valor);
  return nombre.length >= 2 && nombre.length <= 60 && patronNombrePersona.test(nombre);
}

function normalizarTelefono(valor) {
  return String(valor ?? "").replace(/[^0-9]/g, "").slice(0, 9);
}

function esTelefonoValido(valor) {
  return patronTelefonoUruguayo.test(String(valor ?? ""));
}

// -- Revisar un campo de nombre --
// Si hay texto y no cumple el molde, le pone un mensaje de error al campo.
// "setCustomValidity" es como pegarle una notita roja al campo.
// Devuelve true si está bien, false si está mal.
function validarNombre(campo) {
  const nombre = normalizarNombre(campo.value);
  const mensaje =
    campo.value && !esNombreValido(nombre)
      ? "Ingresá tu nombre y apellido (dos palabras, solo letras)."
      : "";

  campo.setCustomValidity(mensaje);

  return mensaje === "";
}

// -- Revisar un campo de celular --
// Misma idea: si hay texto y no cumple el molde 09 + 7 números, marca error.
function validarTelefono(campo) {
  const mensaje =
    campo.value && !esTelefonoValido(campo.value)
      ? "Ingresá un celular uruguayo de 9 dígitos que comience con 09."
      : "";

  campo.setCustomValidity(mensaje);

  return mensaje === "";
}

// -- Vigilar todos los campos de nombre de la página --
// Por cada campo con la etiqueta "data-nombre-persona":
// - "input" = cada vez que escribís una letra, revisamos.
// - "invalid" = cuando el navegador lo marca como inválido, ponemos nuestro mensaje.
// - "blur" = cuando salís del campo, lo limpiamos y revisamos.
if (typeof document !== "undefined") document.querySelectorAll("[data-nombre-persona]").forEach((campo) => {
  campo.addEventListener("input", () => validarNombre(campo));
  campo.addEventListener("invalid", () => validarNombre(campo));
  campo.addEventListener("blur", () => {
    campo.value = normalizarNombre(campo.value);
    validarNombre(campo);
  });
});

// -- Vigilar todos los campos de celular --
// Además de revisar, limpiamos automáticamente: borramos todo lo que no sea número
// y cortamos a 9 dígitos. Así si pegás "09-123-456", queda "09123456..." solo.
if (typeof document !== "undefined") document.querySelectorAll("[data-telefono-uy]").forEach((campo) => {
  campo.addEventListener("input", () => {
    campo.value = normalizarTelefono(campo.value);
    validarTelefono(campo);
  });

  campo.addEventListener("invalid", () => validarTelefono(campo));
});

// -- Compartir una función para revisar formularios enteros --
// La usan calendario.js y home.js antes de aceptar el envío.
// Limpia el nombre, revisa ambos campos y devuelve true/false.
globalThis.ValidacionReserva = Object.freeze({
  esNombreValido,
  esTelefonoValido,
  normalizarNombre,
  normalizarTelefono,
  validarFormulario(formulario) {
    const campoNombre = formulario.querySelector("[data-nombre-persona]");
    const campoTelefono = formulario.querySelector("[data-telefono-uy]");

    if (campoNombre) {
      campoNombre.value = normalizarNombre(campoNombre.value);
      validarNombre(campoNombre);
    }

    if (campoTelefono) {
      validarTelefono(campoTelefono);
    }

    return formulario.checkValidity();
  },
});

if (typeof module !== "undefined" && module.exports) {
  module.exports = globalThis.ValidacionReserva;
}
