const express = require('express');
const router = express.Router();
const { db } = require('../database');
const wrap = require('../utils/wrap');

router.get('/', wrap(async (req, res) => {
  const { status } = req.query;
  let sql = 'SELECT * FROM pedidos';
  const p = [];
  if (status) { sql += ' WHERE status = ?'; p.push(status); }
  sql += ' ORDER BY criado_em DESC LIMIT 200';
  const pedidos = await db.all(sql, p);
  res.json(pedidos.map(ped => ({ ...ped, itens: JSON.parse(ped.itens) })));
}));

router.put('/:id', wrap(async (req, res) => {
  const { status } = req.body;
  const validos = ['novo', 'em_producao', 'entregue', 'cancelado'];
  if (!validos.includes(status)) return res.status(400).json({ erro: 'Status inválido' });
  await db.run('UPDATE pedidos SET status=? WHERE id=?', [status, req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;
