const express = require('express');
const router = express.Router();
const { db } = require('../database');
const wrap = require('../utils/wrap');

router.get('/', wrap(async (req, res) => {
  res.json(await db.all('SELECT * FROM ingredientes ORDER BY nome'));
}));

router.post('/', wrap(async (req, res) => {
  const { nome, unidade, preco_unitario, volume } = req.body;
  const r = await db.run('INSERT INTO ingredientes (nome,unidade,preco_unitario,volume) VALUES (?,?,?,?)', [nome, unidade, preco_unitario, volume]);
  res.json({ id: r.lastID });
}));

router.put('/:id', wrap(async (req, res) => {
  const { nome, unidade, preco_unitario, volume } = req.body;
  await db.run('UPDATE ingredientes SET nome=?,unidade=?,preco_unitario=?,volume=? WHERE id=?', [nome, unidade, preco_unitario, volume, req.params.id]);
  res.json({ ok: true });
}));

router.delete('/:id', wrap(async (req, res) => {
  await db.run('DELETE FROM ingredientes WHERE id=?', [req.params.id]);
  // Also delete from recipes
  await db.run('DELETE FROM receita_ingredientes WHERE ingrediente_id=?', [req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;
