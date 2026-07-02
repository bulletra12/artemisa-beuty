exports.handler = async function (event) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: false, error: "No hay ANTHROPIC_API_KEY configurada" })
      };
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Di hola' }]
      })
    });
    const data = await res.json();
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, test: data.content?.[0]?.text || JSON.stringify(data), keyFound: !!apiKey })
    };
  } catch (err) {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};
