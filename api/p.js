// Página de vista previa de un producto para compartir por WhatsApp/redes.
// Muestra foto + nombre + precio en la vista previa (Open Graph) usando la imagen del producto,
// sin exponer el link del proveedor al cliente, y redirige a la tienda para los visitantes reales.
module.exports = async function handler(req, res) {
  const rawId = (req.query.id || '').toString();
  const id = rawId.replace(/[^\w-]/g, '');
  const store = 'https://www.artemisabeauty.com';
  const redirect = store + '/?producto=' + encodeURIComponent(id);

  let nombre = 'Artemisa Beauty';
  let precio = '';
  let img = 'https://i.ibb.co/jkjZmJ9n/LOGO.jpg';

  try {
    if (id) {
      const url = 'https://firestore.googleapis.com/v1/projects/artemisa-beauty/databases/(default)/documents/productos/' + encodeURIComponent(id);
      const r = await fetch(url);
      if (r.ok) {
        const d = await r.json();
        const f = d.fields || {};
        const gv = k => f[k] && (f[k].stringValue || f[k].integerValue || f[k].doubleValue);
        if (gv('name')) nombre = gv('name');
        const price = gv('price');
        if (price) precio = '$' + Number(price).toLocaleString('es-CO');
        if (gv('img')) img = gv('img');
      }
    }
  } catch (e) { /* si falla, usa los valores por defecto */ }

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const titulo = esc(nombre) + (precio ? (' - ' + precio) : '');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).send(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo}</title>
<meta property="og:type" content="product">
<meta property="og:title" content="${titulo}">
<meta property="og:description" content="Pídelo en Artemisa Beauty 🌸 Envíos a todo Colombia.">
<meta property="og:image" content="${esc(img)}">
<meta property="og:url" content="${esc(redirect)}">
<meta property="og:site_name" content="Artemisa Beauty">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${titulo}">
<meta name="twitter:image" content="${esc(img)}">
<meta http-equiv="refresh" content="0; url=${esc(redirect)}">
<script>location.replace(${JSON.stringify(redirect)});</script>
</head><body style="font-family:sans-serif;text-align:center;padding:40px;color:#8a3a50">Redirigiendo a Artemisa Beauty…</body></html>`);
};
