module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(200).json({ error: 'Sin API key' });

    const { texto, categorias, subcategorias } = req.body || {};
    if (!texto || !texto.trim()) return res.status(200).json({ error: 'Sin texto' });

    const listaCat = (Array.isArray(categorias) && categorias.length)
      ? categorias.join(', ')
      : 'Skincare, Maquillaje, Cabello, Corporal, Electricos, Barberia, Uñas';
    const listaSub = (Array.isArray(subcategorias) && subcategorias.length)
      ? subcategorias.join(', ')
      : '';

    const prompt = `Eres asistente de Artemisa Beauty, una tienda de productos de belleza en Colombia. Lee con cuidado la siguiente información de un producto (pegada de una página de proveedor), analízala y organiza TODOS los datos que encuentres. Compara bien los datos entre sí para no confundir precio con contenido, ni marca con nombre.

TEXTO DEL PRODUCTO:
"""${String(texto).slice(0, 7000)}"""

Responde ÚNICAMENTE con este JSON exacto, sin texto adicional, sin markdown, sin explicaciones:
{"nombre":"","marca":"","sku":"","precio":0,"tamano":"","categoria":"","subcategoria":"","descripcion":"","ficha":"","colores":[]}

Reglas:
- "nombre": nombre comercial del producto, corto y claro (sin la marca si se puede separar).
- "marca": marca del producto si aparece; si no, "".
- "sku": código o referencia del producto si aparece; si no, "".
- "precio": número entero en pesos colombianos. Si hay varios precios, usa el precio de VENTA al público (el mayor o el marcado como precio). Quita puntos y símbolos. Si no hay, 0.
- "tamano": presentación o contenido (ej "30 ml", "250 g", "100 cápsulas") si aparece; si no, "".
- "categoria": elige SOLO UNA de esta lista exacta, la que mejor encaje: ${listaCat}.
- "subcategoria": elige SOLO UNA de esta lista exacta si alguna encaja bien, si no deja "": ${listaSub || '(sin lista)'}.
- "descripcion": 2 o 3 frases comerciales atractivas y naturales para la tienda, en español, resaltando beneficios reales del producto.
- "ficha": ficha técnica COMPLETA como lista, UN dato por línea separados por saltos de línea (\\n). Incluye todo lo que aplique y encuentres: contenido/tamaño, ingredientes o componentes, modo de uso, beneficios, para qué tipo de piel/cabello, precauciones, país de origen. Cada línea en formato "Campo: valor". Sin viñetas ni guiones al inicio.
- "colores": lista de nombres de colores o tonos si el producto los menciona; si no, [].
No inventes datos que no estén en el texto; usa "", 0 o [] cuando no haya info. Sé preciso.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    const texto2 = (data.content?.[0]?.text || '').trim();
    const clean = texto2.replace(/```json|```/g, '').trim();
    try {
      return res.status(200).json(JSON.parse(clean));
    } catch {
      const match = texto2.match(/\{[\s\S]*\}/);
      if (match) {
        try { return res.status(200).json(JSON.parse(match[0])); } catch {}
      }
      return res.status(200).json({ error: 'No se pudo interpretar la respuesta' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
