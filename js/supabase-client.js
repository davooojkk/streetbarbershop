// ============================================================
// SUPABASE-CLIENT: el cable entre tu web y el cuaderno en la nube
// ------------------------------------------------------------
// 1) Abrí este archivo y pegá tus 2 datos donde dice PEGÁ-ACÁ.
//    - La URL que copiaste (https://xxxx.supabase.co, sin /rest/v1).
//    - La publishable/anon key (la pública, NUNCA la secret).
// 2) Guardá. Eso es todo. Los otros archivos usan este cable solos.
// Para GitHub Pages esto queda público a propósito en la demo.
// Cuando vendas, lo cerramos con login por barbero.
// ============================================================

const SUPABASE_URL = "https://pwvnstcbmavyzzsjvjwi.supabase.co"; // ej: "https://abcd1234.supabase.co"
const SUPABASE_ANON_KEY = "sb_publishable_PKjnPh4EuZW0JlIBm-EjEw_lMbexpnH"; // ej: "sb_publishable_..." o "eyJ..."

// Si el CDN está caído, las páginas muestran su estado de error en vez de
// romper toda la ejecución con "supabase is undefined".
globalThis.supabaseBarberia = globalThis.supabase?.createClient
  ? globalThis.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
