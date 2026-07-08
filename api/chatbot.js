module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(200).json({ error: 'Sin API key' });

    const { mensaje, historial, productos } = req.body || {};

    const sistema = `Eres Luna, la asistente virtual de Artemisa Beauty, una tienda colombiana de productos de belleza. Eres amable, cercana y conocedora. Hablas en español colombiano.

Tu especialidad: cuidado del cabello, skincare, maquillaje y productos corporales.

CATÁLOGO ACTUAL DE LA TIENDA (con precios y disponibilidad):
${productos || 'variedad de productos de belleza premium'}

REGLAS IMPORTANTES:
- Responde SIEMPRE en español, breve y útil (máximo 3-4 frases).
- Recomienda productos REALES del catálogo de arriba cuando sea relevante, mencionando su precio.
- Si un producto está marcado como AGOTADO, NO lo recomiendes como disponible; si el cliente pregunta por él, dile amablemente que está agotado por ahora y ofrece una alternativa disponible.
- Si está "En preventa", puedes mencionarlo aclarando que es preventa.
- Si el cliente describe un problema (caspa, caída, resequedad, acné, etc.), busca productos cuya categoría o campo "para:" coincida con ese problema.
- Si preguntan por algo que no está en el catálogo, dilo con honestidad y sugiere escribir al WhatsApp.
- No inventes productos ni precios que no estén en el catálogo.
- Sé cálida y profesional, como una asesora de belleza de confianza.`;

    const messages = [
      ...(historial || []),
      { role: 'user', content: mensaje }
    ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        system: sistema,
        messages
      })
    });

    const data = await response.json();
    const respuesta = data.content?.[0]?.text || 'Lo siento, intenta de nuevo.';
    return res.status(200).json({ respuesta });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
