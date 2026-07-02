export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  try {
    const { nombre, categoria, modo, url } = req.body || {};
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(200).json({ error: 'Sin API key' });

    let prompt;
    if (modo === 'url' && url) {
      prompt = `Analiza este link: ${url}. Responde SOLO en JSON sin backticks: {"nombre":"...","descripcion":"descripción 2 frases para Artemisa Beauty Colombia"}`;
    } else {
      prompt = `Escribe una descripción comercial breve (2-3 frases) y atractiva para este producto de Artemisa Beauty Colombia: "${nombre}" (categoría: ${categoria}). Solo la descripción, sin introducción.`;
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
    const texto = data.content?.[0]?.text || '';

    if (modo === 'url') {
      try {
        const clean = texto.replace(/```json|```/g, '').trim();
        return res.status(200).json(JSON.parse(clean));
      } catch {
        return res.status(200).json({ nombre: '', descripcion: texto.trim() });
      }
    }
    return res.status(200).json({ descripcion: texto.trim() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
