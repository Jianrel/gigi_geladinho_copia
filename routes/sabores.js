const express = require('express');
const router = express.Router();
const { db } = require('../database');
const wrap = require('../utils/wrap');

router.get('/', wrap(async (req, res) => {
  res.json(await db.all('SELECT * FROM sabores WHERE ativo=1 ORDER BY categoria, nome'));
}));

router.post('/', wrap(async (req, res) => {
  const { nome, categoria, preco } = req.body;
  const r = await db.run('INSERT INTO sabores (nome,categoria,preco) VALUES (?,?,?)', [nome, categoria, preco]);
  res.json({ id: r.lastID, nome, categoria, preco });
}));

router.put('/:id', wrap(async (req, res) => {
  const { nome, categoria, preco, ativo } = req.body;
  await db.run('UPDATE sabores SET nome=?,categoria=?,preco=?,ativo=? WHERE id=?', [nome, categoria, preco, ativo ?? 1, req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;
