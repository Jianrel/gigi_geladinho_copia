const express = require('express');
const router = express.Router();
const { db } = require('../database');
const wrap = require('../utils/wrap');

router.get('/:sabor_id', wrap(async (req, res) => {
  const sabor_id = req.params.sabor_id;
  const sabor = await db.get('SELECT rendimento_receita FROM sabores WHERE id=?', [sabor_id]);
  const ingredientes = await db.all(`
    SELECT r.id, r.quantidade, i.id as ingrediente_id, i.nome, i.unidade, i.preco_unitario, i.volume
    FROM receita_ingredientes r
    JOIN ingredientes i ON r.ingrediente_id = i.id
    WHERE r.sabor_id = ?
  `, [sabor_id]);
  res.json({ rendimento: sabor.rendimento_receita, ingredientes });
}));

router.post('/:sabor_id', wrap(async (req, res) => {
  const sabor_id = req.params.sabor_id;
  const { rendimento, ingredientes } = req.body; // ingredientes = [{ingrediente_id, quantidade}]

  await db.run('UPDATE sabores SET rendimento_receita=? WHERE id=?', [rendimento, sabor_id]);
  await db.run('DELETE FROM receita_ingredientes WHERE sabor_id=?', [sabor_id]);

  for (const ing of ingredientes) {
    await db.run('INSERT INTO receita_ingredientes (sabor_id, ingrediente_id, quantidade) VALUES (?,?,?)',
      [sabor_id, ing.ingrediente_id, ing.quantidade]);
  }
  res.json({ ok: true });
}));

module.exports = router;
