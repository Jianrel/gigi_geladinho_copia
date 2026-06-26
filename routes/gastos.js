const express = require('express');
const router = express.Router();
const { db } = require('../database');
const wrap = require('../utils/wrap');

router.get('/', wrap(async (req, res) => {
  const { mes, ano } = req.query;
  let sql = 'SELECT g.*, s.nome as sabor_nome, s.preco as sabor_preco FROM gastos_producao g LEFT JOIN sabores s ON g.sabor_id=s.id';
  const p = [];
  if (mes && ano) {
    sql += " WHERE EXTRACT(MONTH FROM g.data::date) = ? AND EXTRACT(YEAR FROM g.data::date) = ?";
    p.push(parseInt(mes), parseInt(ano));
  }
  sql += ' ORDER BY g.data DESC';
  res.json(await db.all(sql, p));
}));

router.post('/', wrap(async (req, res) => {
  const { data, sabor_id, descricao, valor, geladinhos_produzidos } = req.body;
  const r = await db.run('INSERT INTO gastos_producao (data,sabor_id,descricao,valor,geladinhos_produzidos) VALUES (?,?,?,?,?)',
    [data, sabor_id||null, descricao, valor, geladinhos_produzidos||0]);
  res.json({ id: r.lastID });
}));

router.delete('/:id', wrap(async (req, res) => {
  await db.run('DELETE FROM gastos_producao WHERE id=?', [req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;
