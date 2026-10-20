const express = require('express');
const router = express.Router();
const { db } = require('../database');
const wrap = require('../utils/wrap');
const { STATUS_VALIDOS, mudarStatusPedido } = require('../utils/statusPedido');

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
  if (!STATUS_VALIDOS.includes(status)) return res.status(400).json({ erro: 'Status inválido' });
  const r = await mudarStatusPedido(req.params.id, status);
  if (!r) return res.status(404).json({ erro: 'Pedido não encontrado' });
  res.json({ ok: true });
}));

module.exports = router;
