const express = require('express');
const router = express.Router();
const { db } = require('../database');
const wrap = require('../utils/wrap');

router.get('/', wrap(async (req, res) => {
  const { status, ponto_id } = req.query;
  const filtroPonto = ponto_id && ponto_id !== 'todos';
  let sql = 'SELECT p.*, pv.nome as ponto_nome FROM pedidos p LEFT JOIN pontos_venda pv ON p.ponto_id = pv.id';
  const p = [];
  const wheres = [];
  if (status) { wheres.push('p.status = ?'); p.push(status); }
  if (filtroPonto) { wheres.push('p.ponto_id = ?'); p.push(parseInt(ponto_id)); }
  if (wheres.length) sql += ' WHERE ' + wheres.join(' AND ');
  sql += ' ORDER BY p.criado_em DESC LIMIT 200';
  const pedidos = await db.all(sql, p);
  res.json(pedidos.map(ped => ({ ...ped, itens: JSON.parse(ped.itens) })));
}));

router.put('/:id', wrap(async (req, res) => {
  const { status, ponto_id } = req.body;
  if (status) {
    const validos = ['novo', 'em_producao', 'entregue', 'cancelado'];
    if (!validos.includes(status)) return res.status(400).json({ erro: 'Status inválido' });
  }
  const sets = [];
  const params = [];
  if (status) { sets.push('status=?'); params.push(status); }
  if (ponto_id) { sets.push('ponto_id=?'); params.push(parseInt(ponto_id)); }
  if (!sets.length) return res.status(400).json({ erro: 'Nada para atualizar' });
  params.push(req.params.id);
  await db.run(`UPDATE pedidos SET ${sets.join(', ')} WHERE id=?`, params);
  res.json({ ok: true });
}));

module.exports = router;
