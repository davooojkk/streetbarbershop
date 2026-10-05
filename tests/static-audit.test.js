const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const raiz = path.resolve(__dirname, "..");
const htmls = ["index.html", "agenda.html", "dashboard.html", "login.html"];

for (const archivo of htmls) {
  const contenido = fs.readFileSync(path.join(raiz, archivo), "utf8");
  assert.match(contenido, /<meta name="description" content="[^"]+"/i, `${archivo}: falta description`);
  assert.doesNotMatch(contenido, /@supabase\/supabase-js@2["']/i, `${archivo}: CDN sin versión fija`);
  assert.match(contenido, /@supabase\/supabase-js@2\.117\.2/i, `${archivo}: versión Supabase inesperada`);
  assert.match(contenido, /integrity="sha384-[^"]+"/i, `${archivo}: falta SRI`);

  for (const coincidencia of contenido.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const recurso = coincidencia[1];
    if (/^(?:https?:|mailto:|tel:|#)/.test(recurso)) continue;
    const ruta = recurso.split(/[?#]/)[0];
    assert.ok(fs.existsSync(path.resolve(raiz, ruta)), `${archivo}: no existe ${ruta}`);
  }
}

const migracionInicial = fs.readFileSync(path.join(raiz, "supabase/migrations/0001_modelo_seguro.sql"), "utf8");
assert.doesNotMatch(migracionInicial, /drop\s+table\s+(?:if\s+exists\s+)?public\.reservas/i, "0001 no debe borrar reservas");

const hotfix = fs.readFileSync(path.join(raiz, "supabase/migrations/0003_reparar_pgcrypto.sql"), "utf8");
assert.match(hotfix, /search_path\s*=\s*pg_catalog,\s*extensions/i, "0003: pgcrypto debe estar en search_path");

const endurecimiento = fs.readFileSync(path.join(raiz, "supabase/migrations/0004_integridad_reintentos.sql"), "utf8");
for (const regla of ["obtener_reserva_con_token", "pg_advisory_xact_lock", "reprogramada_desde", "IDEMPOTENCY_KEY_REUSED"]) {
  assert.ok(endurecimiento.includes(regla), `0004: falta ${regla}`);
}

function jsEn(directorio) {
  return fs.readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(directorio, entrada.name);
    return entrada.isDirectory() ? jsEn(ruta) : entrada.name.endsWith(".js") ? [ruta] : [];
  });
}

for (const archivo of jsEn(path.join(raiz, "js"))) {
  const resultado = spawnSync(process.execPath, ["--check", archivo], { encoding: "utf8" });
  assert.equal(resultado.status, 0, `${path.relative(raiz, archivo)}: ${resultado.stderr}`);
}

console.log("Auditoría estática correcta.");
