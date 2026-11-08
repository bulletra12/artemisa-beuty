module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(200).json({ error: 'Sin API key' });

    const { texto } = req.body || {};
    if (!texto || !texto.trim()) return res.status(200).json({ error: 'Sin texto' });

    const prompt = `Eres asistente de Artemisa Beauty, una tienda de productos de belleza en Colombia. A partir de la siguiente información de un producto (pegada de una página de proveedor), extrae y organiza los datos.

TEXTO DEL PRODUCTO:
"""${String(texto).slice(0, 6000)}"""

Responde ÚNICAMENTE con este JSON exacto, sin texto adicional, sin markdown, sin explicaciones:
{"nombre":"","marca":"","precio":0,"tamano":"","categoria":"","descripcion":"","ficha":"","colores":[]}

Reglas:
- "nombre": nombre comercial del producto, corto y claro.
- "marca": marca del producto si aparece; si no, "".
- "precio": número entero en pesos colombianos si aparece un precio; si no, 0.
- "tamano": presentación o contenido (ej "30 ml", "250 g", "100 cápsulas") si aparece; si no, "".
- "categoria": elige SOLO UNA de esta lista exacta: Skincare, Maquillaje, Cabello, Corporal, Electricos, Barberia, Uñas. La que mejor encaje.
- "descripcion": 2 frases comerciales atractivas para la tienda, en español.
- "ficha": ficha técnica como lista, UN dato por línea separados por saltos de línea (\\n). Incluye lo que aplique: contenido, ingredientes, modo de uso, beneficios. Sin viñetas ni guiones al inicio.
- "colores": lista de nombres de colores o tonos si el producto los menciona; si no, [].
No inventes datos que no estén en el texto; usa "", 0 o [] cuando no haya info.`;

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
