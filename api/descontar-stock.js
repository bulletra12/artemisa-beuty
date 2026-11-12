// Descuenta el stock (por color y total) cuando se hace un pedido.
// La página envía los items del carrito; el servidor actualiza Firestore con
// la llave de servicio (así funciona aunque el cliente no sea admin).
//
// Body: { items: [{ id, color, qty }] }

const { descontarStockPorColor } = require('./_firestore');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const { items } = req.body || {};
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Sin items' });
    const limpios = items.map(i => ({ id: i.id, color: i.color || null, qty: Math.max(1, parseInt(i.qty) || 1) }))
      .filter(i => i.id != null);
    const r = await descontarStockPorColor(limpios);
    return res.status(200).json(r);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
