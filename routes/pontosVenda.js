const express = require('express');
const router = express.Router();
const { db } = require('../database');
const wrap = require('../utils/wrap');

router.get('/', wrap(async (req, res) => {
  res.json(await db.all('SELECT * FROM pontos_venda WHERE ativo=1 ORDER BY id'));
}));

router.post('/', wrap(async (req, res) => {
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório' });
  const r = await db.run('INSERT INTO pontos_venda (nome) VALUES (?)', [nome.trim()]);
  res.json({ id: r.lastID, nome: nome.trim() });
}));

router.put('/:id', wrap(async (req, res) => {
  const { nome, ativo } = req.body;
  await db.run('UPDATE pontos_venda SET nome=?, ativo=? WHERE id=?',
    [nome, ativo ?? 1, req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;
