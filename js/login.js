const formularioLogin = document.querySelector("#login-form");
const errorLogin = document.querySelector("#login-error");
const botonLogin = formularioLogin?.querySelector("button[type='submit']");

function mostrarErrorLogin(mensaje) {
  errorLogin.textContent = mensaje;
  errorLogin.hidden = false;
}

formularioLogin?.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  errorLogin.hidden = true;
  const cliente = globalThis.supabaseBarberia;
  if (!cliente || !window.supabase) {
    mostrarErrorLogin("No pude conectar con la nube. Revisá tu conexión.");
    return;
  }

  botonLogin.disabled = true;
  botonLogin.setAttribute("aria-busy", "true");
  try {
    const { error } = await cliente.auth.signInWithPassword({
      email: document.querySelector("#login-email").value.trim(),
      password: document.querySelector("#login-pass").value,
    });
    if (error) {
      mostrarErrorLogin("No pude entrar. Revisá email y contraseña.");
      return;
    }
    window.location.assign("dashboard.html");
  } catch {
    mostrarErrorLogin("No pude conectar con la nube. Revisá tu conexión.");
  } finally {
    botonLogin.disabled = false;
    botonLogin.removeAttribute("aria-busy");
  }
});
