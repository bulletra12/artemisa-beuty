module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(200).json({ error: 'Sin API key' });

    const { nombre, categoria, modo, url } = req.body || {};
    let prompt;

    if (modo === 'url' && url) {
      prompt = `Analiza este link de producto de belleza: ${url}

IMPORTANTE: Responde ÚNICAMENTE con este JSON exacto, sin texto adicional, sin emojis fuera del JSON, sin explicaciones:
{"nombre":"nombre real del producto","descripcion":"descripción comercial de 2 frases para Artemisa Beauty Colombia","foto":""}

Infiere el nombre del producto desde la URL si no puedes acceder. No agregues nada más.`;
    } else {
      prompt = `Escribe una descripción comercial breve (2-3 frases) y atractiva para este producto de Artemisa Beauty Colombia: "${nombre}" (categoría: ${categoria}). Solo responde con la descripción, sin introducción ni explicación.`;
    }

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
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    const texto = (data.content?.[0]?.text || '').trim();

    if (modo === 'url') {
      try {
        const clean = texto.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(clean);
        return res.status(200).json(parsed);
      } catch {
        // Intentar extraer JSON con regex
        const match = texto.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            return res.status(200).json(JSON.parse(match[0]));
          } catch {}
        }
        return res.status(200).json({ nombre: '', descripcion: texto, foto: '' });
      }
    }

    return res.status(200).json({ descripcion: texto });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
