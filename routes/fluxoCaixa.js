const express = require('express');
const router = express.Router();
const { db } = require('../database');
const wrap = require('../utils/wrap');

// Movimentos de todas as origens, com filtro opcional de datas (texto 'YYYY-MM-DD').
// desde: >= ; ate: <= ; antesDe: <
async function listarMovimentos({ desde, ate, antesDe } = {}) {
  const filtro = col => {
    const conds = [], p = [];
    if (desde)   { conds.push(`${col} >= ?`); p.push(desde); }
    if (ate)     { conds.push(`${col} <= ?`); p.push(ate); }
    if (antesDe) { conds.push(`${col} < ?`);  p.push(antesDe); }
    return { sql: conds.length ? ' AND ' + conds.join(' AND ') : '', p };
  };

  // Entradas: vendas dos lançamentos (a partir de 07/2026 as vendas são lançadas manualmente)
  const fv = filtro('l.data');
  const vendas = await db.all(`
    SELECT l.data, s.nome as descricao, 'entrada' as tipo, 'Vendas' as categoria,
      GREATEST(0, CASE WHEN l.quantidade > 0 THEN (l.quantidade - l.voltaram)
        ELSE (l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END) * s.preco::numeric as valor
    FROM lancamentos l JOIN sabores s ON l.sabor_id = s.id
    WHERE l.data < '2026-07-01'
      AND GREATEST(0, CASE WHEN l.quantidade > 0 THEN (l.quantidade - l.voltaram)
        ELSE (l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END) > 0
      ${fv.sql}
  `, fv.p);

  // Saídas: gastos de produção
  const fg = filtro('g.data');
  const gastos = await db.all(`
    SELECT g.data, COALESCE('Produção: ' || s.nome, g.descricao, 'Gasto avulso') as descricao,
      'saida' as tipo, 'Produção' as categoria, g.valor
    FROM gastos_producao g LEFT JOIN sabores s ON g.sabor_id = s.id
    WHERE 1=1 ${fg.sql}
  `, fg.p);

  // Lançamentos avulsos (realizados e previstos)
  const fa = filtro('data');
  const avulsos = await db.all(`
    SELECT id, data, descricao, tipo, categoria, valor, status, pedido_id
    FROM fluxo_caixa_avulso
    WHERE 1=1 ${fa.sql}
  `, fa.p);

  return [
    ...vendas.map(r => ({ ...r, origem: 'lancamento', status: 'realizado' })),
    ...gastos.map(r => ({ ...r, origem: 'gasto', status: 'realizado' })),
    ...avulsos.map(r => ({ ...r, origem: 'avulso' }))
  ].map(r => ({ ...r, valor: parseFloat(r.valor) || 0 }));
}

const sinal = r => (r.tipo === 'entrada' ? r.valor : -r.valor);
const somar = lista => lista.reduce((a, r) => a + sinal(r), 0);
const arred = v => Math.round(v * 100) / 100;

async function lerSaldoInicial() {
  const rows = await db.all("SELECT chave, valor FROM configuracoes WHERE chave IN ('caixa_saldo_inicial', 'caixa_data_inicial')");
  const cfg = Object.fromEntries(rows.map(r => [r.chave, r.valor]));
  if (!cfg.caixa_data_inicial) return null;
  return { valor: parseFloat(cfg.caixa_saldo_inicial) || 0, data: cfg.caixa_data_inicial };
}

router.get('/', wrap(async (req, res) => {
  const { mes, ano } = req.query;
  let { dataInicio, dataFim } = req.query;
  if (!dataInicio || !dataFim) {
    const m = String(parseInt(mes)).padStart(2, '0');
    const ultimoDia = new Date(parseInt(ano), parseInt(mes), 0).getDate();
    dataInicio = `${ano}-${m}-01`;
    dataFim = `${ano}-${m}-${String(ultimoDia).padStart(2, '0')}`;
  }

  // Saldo inicial: valor em caixa no início do dia informado.
  // Sem saldo inicial cadastrado, o saldo é acumulado desde o primeiro registro.
  const saldoInicial = await lerSaldoInicial();
  const base = saldoInicial ? saldoInicial.valor : 0;
  const dataBase = saldoInicial ? saldoInicial.data : null;

  // previstos contam em qualquer data; realizados só a partir do saldo inicial
  const historico = await listarMovimentos();
  const realizados = historico.filter(r => r.status === 'realizado' && (!dataBase || r.data >= dataBase));
  const previstos = historico.filter(r => r.status === 'previsto');

  const saldoAtual = base + somar(realizados);
  const aReceber = previstos.filter(r => r.tipo === 'entrada').reduce((a, r) => a + r.valor, 0);
  const aPagar = previstos.filter(r => r.tipo === 'saida').reduce((a, r) => a + r.valor, 0);

  // Saldo no início do período (antes do saldo inicial não há saldo conhecido)
  const periodoAntesDaBase = dataBase && dataInicio < dataBase;
  const saldoAnterior = periodoAntesDaBase
    ? null
    : base + somar(realizados.filter(r => r.data < dataInicio));

  const registros = (await listarMovimentos({ desde: dataInicio, ate: dataFim }))
    .sort((a, b) => a.data.localeCompare(b.data));

  // Saldo acumulado linha a linha (só lançamentos realizados alteram o saldo)
  let saldo = periodoAntesDaBase ? base : saldoAnterior;
  registros.forEach(r => {
    if (r.status !== 'realizado' || (dataBase && r.data < dataBase)) { r.saldo = null; return; }
    saldo += sinal(r);
    r.saldo = arred(saldo);
  });
  const periodoTodoAntesDaBase = dataBase && dataFim < dataBase;

  res.json({
    registros: registros.reverse(), // mais recente primeiro
    saldoInicial,
    saldoAnterior: saldoAnterior === null ? null : arred(saldoAnterior),
    saldoFinal: periodoTodoAntesDaBase ? null : arred(saldo),
    saldoAtual: arred(saldoAtual),
    aReceber: arred(aReceber),
    aPagar: arred(aPagar),
    saldoPrevisto: arred(saldoAtual + aReceber - aPagar)
  });
}));

router.post('/avulso', wrap(async (req, res) => {
  const { data, descricao, tipo, categoria, valor } = req.body;
  const status = req.body.status === 'previsto' ? 'previsto' : 'realizado';
  if (!data || !descricao || !tipo || !valor) return res.status(400).json({ erro: 'Campos obrigatórios: data, descricao, tipo, valor' });
  const v = parseFloat(valor);
  const r = await db.run(
    'INSERT INTO fluxo_caixa_avulso (data,descricao,tipo,categoria,valor,status,data_prevista,valor_previsto) VALUES (?,?,?,?,?,?,?,?)',
    [data, descricao, tipo, categoria || null, v, status, status === 'previsto' ? data : null, status === 'previsto' ? v : null]
  );
  if (categoria && categoria !== '__nova__') await db.run('INSERT INTO fluxo_categorias (nome) VALUES (?) ON CONFLICT (nome) DO NOTHING', [categoria]);
  res.json({ id: r.lastID });
}));

// marca um lançamento previsto como pago/recebido, com a data e o valor efetivos
router.put('/avulso/:id/realizar', wrap(async (req, res) => {
  const { data, valor } = req.body;
  if (!data || !valor) return res.status(400).json({ erro: 'Informe a data e o valor do pagamento' });
  const r = await db.run(
    "UPDATE fluxo_caixa_avulso SET status='realizado', data=?, valor=? WHERE id=? AND status='previsto'",
    [data, parseFloat(valor), req.params.id]
  );
  if (!r.changes) return res.status(404).json({ erro: 'Lançamento previsto não encontrado' });
  res.json({ ok: true });
}));

router.delete('/avulso/:id', wrap(async (req, res) => {
  await db.run('DELETE FROM fluxo_caixa_avulso WHERE id=?', [req.params.id]);
  res.json({ ok: true });
}));

router.get('/saldo-inicial', wrap(async (req, res) => {
  res.json(await lerSaldoInicial());
}));

router.put('/saldo-inicial', wrap(async (req, res) => {
  const { valor, data } = req.body;
  if (!data || valor === undefined || valor === '' || isNaN(parseFloat(valor)))
    return res.status(400).json({ erro: 'Informe o valor e a data do saldo inicial' });
  // db.all em vez de db.run: run acrescenta "RETURNING id" e esta tabela não tem id
  const upsert = 'INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor';
  await db.all(upsert, ['caixa_saldo_inicial', String(parseFloat(valor))]);
  await db.all(upsert, ['caixa_data_inicial', data]);
  res.json({ ok: true });
}));

router.get('/categorias', wrap(async (req, res) => {
  const rows = await db.all('SELECT nome FROM fluxo_categorias ORDER BY id');
  res.json(rows.map(r => r.nome));
}));

router.post('/categorias', wrap(async (req, res) => {
  const nome = (req.body.nome || '').trim();
  if (!nome || nome === '__nova__') return res.status(400).json({ erro: 'Informe o nome da categoria' });
  await db.run('INSERT INTO fluxo_categorias (nome) VALUES (?) ON CONFLICT (nome) DO NOTHING', [nome]);
  res.json({ ok: true });
}));

module.exports = router;
