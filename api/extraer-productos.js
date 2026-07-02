export default async function handler(req, res) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(200).json({ ok: false, error: "No hay ANTHROPIC_API_KEY" });
    }

    const { url, categoria } = req.body || {};

    const prompt = url
      ? `Analiza esta URL de proveedor de belleza: ${url}. Extrae productos y responde SOLO con JSON array sin backticks: [{"nombre":"...","descripcion":"...","precio_proveedor":50000,"emoji":"💄"}]. Si no puedes acceder infiere 6 productos de esa marca. Categoría: ${categoria||'Skincare'}.`
      : 'Di hola';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    const texto = data.content?.[0]?.text || '[]';

    if (!url) return res.status(200).json({ ok: true, test: texto });

    const match = texto.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No se pudo parsear respuesta');
    const productos = JSON.parse(match[0]);
    return res.status(200).json({ ok: true, productos });

  } catch (err) {
    return res.status(200).json({ ok: false, error: err.message });
  }
}
