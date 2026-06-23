const express = require('express');
const router = express.Router();
const { db } = require('../database');
const wrap = require('../utils/wrap');

router.get('/', wrap(async (req, res) => {
  const { data, mes, ano, ponto_id } = req.query;
  const filtroPonto = ponto_id && ponto_id !== 'todos';

  const base = `SELECT l.*, s.nome as sabor_nome, s.categoria, s.preco,
    (CASE WHEN l.quantidade > 0 THEN GREATEST(0, l.quantidade - l.voltaram) ELSE GREATEST(0, l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END) as vendidos,
    COALESCE(l.quantidade, 0) as quantidade
    FROM lancamentos l JOIN sabores s ON l.sabor_id = s.id`;

  if (data) {
    const pontoWhere = filtroPonto ? 'AND l.ponto_id = ?' : '';
    const prevPontoWhere = filtroPonto ? 'AND ponto_id = ?' : '';
    const pid = parseInt(ponto_id);
    const params = filtroPonto
      ? [data, data, pid, pid, data, pid]
      : [data, data, data];

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
      LEFT JOIN lancamentos l ON l.sabor_id = s.id AND l.data = ? ${pontoWhere}
      LEFT JOIN lancamentos prev ON prev.sabor_id = s.id AND prev.data = (SELECT MAX(data) FROM lancamentos WHERE sabor_id = s.id ${prevPontoWhere} AND data < ?) ${filtroPonto ? 'AND prev.ponto_id = ?' : ''}
      WHERE s.ativo = 1
      ORDER BY s.categoria, s.nome`;
    res.json(await db.all(sqlData, params));
  } else if (mes && ano) {
    const pontoWhere = filtroPonto ? ' AND l.ponto_id = ?' : '';
    const params = [parseInt(mes), parseInt(ano)];
    if (filtroPonto) params.push(parseInt(ponto_id));
    res.json(await db.all(base + ` WHERE EXTRACT(MONTH FROM l.data::date) = ? AND EXTRACT(YEAR FROM l.data::date) = ?${pontoWhere} ORDER BY l.data, s.nome`, params));
  } else {
    const pontoWhere = filtroPonto ? ' WHERE l.ponto_id = ?' : '';
    const params = filtroPonto ? [parseInt(ponto_id)] : [];
    res.json(await db.all(base + `${pontoWhere} ORDER BY l.data DESC, s.nome LIMIT 500`, params));
  }
}));

router.get('/datas', wrap(async (req, res) => {
  const { mes, ano, ponto_id } = req.query;
  const filtroPonto = ponto_id && ponto_id !== 'todos';
  let sql = 'SELECT DISTINCT data FROM lancamentos';
  const p = [];
  const wheres = [];
  if (mes && ano) {
    wheres.push("EXTRACT(MONTH FROM data::date) = ? AND EXTRACT(YEAR FROM data::date) = ?");
    p.push(parseInt(mes), parseInt(ano));
  }
  if (filtroPonto) {
    wheres.push("ponto_id = ?");
    p.push(parseInt(ponto_id));
  }
  if (wheres.length) sql += ' WHERE ' + wheres.join(' AND ');
  sql += ' ORDER BY data DESC';
  res.json((await db.all(sql, p)).map(r => r.data));
}));

router.post('/', wrap(async (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [req.body];
  let ok = 0, erros = 0;
  for (const item of items) {
    try {
      const ponto_id = item.ponto_id || 1;
      const estoque_inicial = item.estoque_inicial || 0;
      const fez = item.fez || 0;
      const furou = item.furou || 0;
      const voltaram = item.voltaram ?? 0;
      const quantidade = item.quantidade ?? 0;
      let estoque_final = item.estoque_final;
      if (estoque_final === undefined || estoque_final === null || estoque_final === '') {
        estoque_final = Math.max(0, estoque_inicial + fez - furou - voltaram);
      } else {
        estoque_final = parseInt(estoque_final) || 0;
      }
      await db.run(`INSERT INTO lancamentos (data,sabor_id,ponto_id,estoque_inicial,fez,furou,voltaram,estoque_final,quantidade)
        VALUES (?,?,?,?,?,?,?,?,?)
        ON CONFLICT(data,sabor_id,ponto_id) DO UPDATE SET
          estoque_inicial=excluded.estoque_inicial, fez=excluded.fez,
          furou=excluded.furou, voltaram=excluded.voltaram,
          estoque_final=excluded.estoque_final, quantidade=excluded.quantidade`,
        [item.data, item.sabor_id, ponto_id, estoque_inicial, fez, furou, voltaram, estoque_final, quantidade]);
      ok++;
    } catch (e) {
      console.error('Erro ao salvar item:', e);
      erros++;
    }
  }
  res.json({ ok, erros });
}));

router.delete('/:data', wrap(async (req, res) => {
  const { ponto_id } = req.query;
  const filtroPonto = ponto_id && ponto_id !== 'todos';
  if (filtroPonto) {
    await db.run('DELETE FROM lancamentos WHERE data=? AND ponto_id=?', [req.params.data, parseInt(ponto_id)]);
  } else {
    await db.run('DELETE FROM lancamentos WHERE data=?', [req.params.data]);
  }
  res.json({ ok: true });
}));

module.exports = router;
