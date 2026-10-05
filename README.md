# Street Barbershop

Sitio estático con agenda pública y panel privado, publicado en GitHub Pages y
con Supabase como backend.

## Reparación del despliegue actual

El fallo reproducido al reservar en GitHub Pages es PostgreSQL `42883`:
`function digest(text, unknown) does not exist`. En Supabase, `pgcrypto` vive en
el esquema `extensions`, mientras que las RPC originales usan un `search_path`
vacío.

1. Abrir **Supabase → SQL Editor → New query**.
2. Ejecutar completo `supabase/migrations/0003_reparar_pgcrypto.sql`.
3. Ejecutar completo `supabase/migrations/0004_integridad_reintentos.sql`.
4. Esperar hasta dos minutos por el caché de PostgREST.
5. Publicar estos archivos y probar una reserva nueva en GitHub Pages.

Las migraciones deben aplicarse una sola vez y en orden. `0001` ya no elimina
una tabla existente: se detiene para proteger los datos.

## Pruebas locales

Requiere Node.js 22 o posterior:

```sh
npm test
```

El workflow `.github/workflows/ci.yml` ejecuta estas pruebas en cada push y pull
request. El gate que modifica una base debe ejecutarse únicamente contra un
proyecto Supabase de pruebas:

```powershell
$env:SUPABASE_URL="https://tu-proyecto-de-pruebas.supabase.co"
$env:SUPABASE_ANON_KEY="tu-clave-publica"
node tests/supabase/gate.js
```

No uses la `service_role` en el navegador, GitHub Pages, variables del gate ni
archivos versionados. La clave publishable/anon sí es pública por diseño; la
protección real está en permisos, RLS y RPC.

## Acceso al repositorio

El repositorio público permite auditoría sin credenciales. Para que otra
persona o automatización publique cambios, agregala en GitHub desde
**Settings → Collaborators → Add people** con permiso de escritura, o trabajá
mediante un fork y pull request. Nunca compartas contraseñas, claves
`service_role` ni tokens personales dentro del código o del chat.
