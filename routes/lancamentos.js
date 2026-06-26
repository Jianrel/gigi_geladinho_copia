const express = require('express');
const router = express.Router();
const { db } = require('../database');
const wrap = require('../utils/wrap');

router.get('/', wrap(async (req, res) => {
  const { data, mes, ano } = req.query;
  const base = `SELECT l.*, s.nome as sabor_nome, s.categoria, s.preco,
    (CASE WHEN l.quantidade > 0 THEN GREATEST(0, l.quantidade - l.voltaram) ELSE GREATEST(0, l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END) as vendidos,
    COALESCE(l.quantidade, 0) as quantidade
    FROM lancamentos l JOIN sabores s ON l.sabor_id = s.id`;

  if (data) {
    const sqlData = `
      SELECT
        s.id as sabor_id, s.nome as sabor_nome, s.categoria, s.preco,
        l.id, COALESCE(l.data, ?) as data,
        COALESCE(l.estoque_inicial, prev.estoque_final, 0) as estoque_inicial,
        l.fez, l.furou, l.voltaram,
        COALESCE(l.quantidade, 0) as quantidade,
        l.estoque_final,
        (CASE WHEN COALESCE(l.quantidade,0) > 0 THEN GREATEST(0, l.quantidade - l.voltaram) ELSE GREATEST(0, l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END) as vendidos
      FROM sabores s
      LEFT JOIN lancamentos l ON l.sabor_id = s.id AND l.data = ?
      LEFT JOIN lancamentos prev ON prev.sabor_id = s.id AND prev.data = (SELECT MAX(data) FROM lancamentos WHERE sabor_id = s.id AND data < ?)
      WHERE s.ativo = 1
      ORDER BY s.categoria, s.nome`;
    res.json(await db.all(sqlData, [data, data, data]));
  } else if (mes && ano) {
    res.json(await db.all(base + " WHERE EXTRACT(MONTH FROM l.data::date) = ? AND EXTRACT(YEAR FROM l.data::date) = ? ORDER BY l.data, s.nome",
      [parseInt(mes), parseInt(ano)]));
  } else {
    res.json(await db.all(base + ' ORDER BY l.data DESC, s.nome LIMIT 500'));
  }
}));

router.get('/datas', wrap(async (req, res) => {
  const { mes, ano } = req.query;
  let sql = 'SELECT DISTINCT data FROM lancamentos';
  const p = [];
  if (mes && ano) {
    sql += " WHERE EXTRACT(MONTH FROM data::date) = ? AND EXTRACT(YEAR FROM data::date) = ?";
    p.push(parseInt(mes), parseInt(ano));
  }
  sql += ' ORDER BY data DESC';
  res.json((await db.all(sql, p)).map(r => r.data));
}));

router.post('/', wrap(async (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [req.body];
  let ok = 0, erros = 0;
  for (const item of items) {
    try {
      const estoque_inicial = item.estoque_inicial || 0;
      const fez = item.fez || 0;
      const furou = item.furou || 0;
      const voltaram = item.voltaram ?? 0;
      const quantidade = item.quantidade ?? 0;
      // Calcular estoque_final automaticamente se não fornecido ou for 0 mas outros campos têm valor
      let estoque_final = item.estoque_final;
      if (estoque_final === undefined || estoque_final === null || estoque_final === '') {
        estoque_final = Math.max(0, estoque_inicial + fez - furou - voltaram);
      } else {
        estoque_final = parseInt(estoque_final) || 0;
      }
      await db.run(`INSERT INTO lancamentos (data,sabor_id,estoque_inicial,fez,furou,voltaram,estoque_final,quantidade)
        VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(data,sabor_id) DO UPDATE SET
          estoque_inicial=excluded.estoque_inicial, fez=excluded.fez,
          furou=excluded.furou, voltaram=excluded.voltaram,
          estoque_final=excluded.estoque_final, quantidade=excluded.quantidade`,
        [item.data, item.sabor_id, estoque_inicial, fez, furou, voltaram, estoque_final, quantidade]);
      ok++;
    } catch (e) {
      console.error('Erro ao salvar item:', e);
      erros++;
    }
  }
  res.json({ ok, erros });
}));

router.delete('/:data', wrap(async (req, res) => {
  await db.run('DELETE FROM lancamentos WHERE data=?', [req.params.data]);
  res.json({ ok: true });
}));

module.exports = router;
