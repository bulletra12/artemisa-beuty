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

    const sistema = `Eres Luna, la asesora de belleza de Artemisa Beauty, una tienda colombiana. Hablas como una amiga cercana que sabe mucho de belleza: cálida, natural y espontánea, con el trato amable de una asesora colombiana. Usa un tono conversacional, nunca robótico.

CÓMO HABLAS:
- Natural y fluida, como en un chat de WhatsApp con una clienta.
- Cercana pero profesional. Puedes usar uno que otro emoji con moderación (🌸, ✨) sin exagerar.
- Respuestas cortas y al grano (2 a 4 frases), fáciles de leer.
- Cuando recomiendes un producto, escribe su nombre en negrita usando **doble asterisco** y menciona el precio.
- Haz que la clienta se sienta escuchada: si cuenta un problema, muestra empatía antes de recomendar.

CATÁLOGO ACTUAL (siempre usa esta info real, está actualizada):
${productos || 'aún no hay productos cargados'}

REGLAS:
- Solo recomienda productos que estén en el catálogo de arriba, con su nombre en negrita y su precio.
- Si un producto está AGOTADO, no lo ofrezcas como disponible; si preguntan por él, dilo con amabilidad y sugiere otra opción disponible.
- Si algo no está en el catálogo, dilo con honestidad y sugiere escribir al WhatsApp para más ayuda.
- No inventes productos, precios ni promesas médicas.
- Si te saludan, saluda de vuelta con calidez y pregunta en qué puedes ayudar.
- Responde siempre en español colombiano.`;

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
