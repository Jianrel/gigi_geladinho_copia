const express = require('express');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { db, inicializar } = require('./database');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function getIPLocal() {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return 'localhost';
}

const wrap = fn => (req, res) => fn(req, res).catch(err => res.status(500).json({ erro: err.message }));

// ─── AUTH ─────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'gigi-geladinho-2024';

function hashSenha(senha, salt) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(senha, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verificarSenha(senha, senhaHash) {
  const [salt] = senhaHash.split(':');
  return hashSenha(senha, salt) === senhaHash;
}

function criarToken(id, nome) {
  const payload = Buffer.from(`${id}|${nome}|${Date.now()}`).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verificarToken(token) {
  try {
    const lastDot = token.lastIndexOf('.');
    const payload = token.substring(0, lastDot);
    const sig = token.substring(lastDot + 1);
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
    if (sig !== expected) return null;
    const [id, nome] = Buffer.from(payload, 'base64url').toString().split('|');
    return { id: parseInt(id), nome };
  } catch { return null; }
}

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const usuario = token ? verificarToken(token) : null;
  if (!usuario) return res.status(401).json({ erro: 'Não autenticado' });
  req.usuario = usuario;
  next();
}

async function seedUsuarios() {
  const count = await db.get('SELECT COUNT(*) as c FROM usuarios');
  if (parseInt(count.c) === 0) {
    for (const nome of ['Jailson', 'Gilberto', 'Carmen']) {
      await db.run('INSERT INTO usuarios (nome, senha_hash, deve_trocar_senha) VALUES (?,?,?)',
        [nome, hashSenha('12345678'), true]);
    }
    console.log('✅ Usuários padrão criados!');
  }
}

// ─── ROTAS PÚBLICAS (sem autenticação) ────────
app.post('/api/login', wrap(async (req, res) => {
  const { nome, senha } = req.body;
  if (!nome || !senha) return res.status(400).json({ erro: 'Preencha usuário e senha' });
  const usuario = await db.get('SELECT * FROM usuarios WHERE LOWER(nome) = LOWER(?)', [nome.trim()]);
  if (!usuario || !verificarSenha(senha, usuario.senha_hash))
    return res.status(401).json({ erro: 'Usuário ou senha incorretos' });
  const token = criarToken(usuario.id, usuario.nome);
  res.json({ token, nome: usuario.nome, deve_trocar_senha: usuario.deve_trocar_senha });
}));

app.post('/api/alterar-senha', auth, wrap(async (req, res) => {
  const { nova_senha } = req.body;
  if (!nova_senha || nova_senha.length < 6)
    return res.status(400).json({ erro: 'Senha deve ter no mínimo 6 caracteres' });
  await db.run('UPDATE usuarios SET senha_hash=?, deve_trocar_senha=FALSE WHERE id=?',
    [hashSenha(nova_senha), req.usuario.id]);
  res.json({ ok: true });
}));

app.post('/api/logout', (req, res) => {
  res.json({ ok: true }); // token é stateless, logout só limpa o cliente
});

// rota pública — usada na tela de pedido sem login
app.get('/api/sabores-publico', wrap(async (req, res) => {
  res.json(await db.all('SELECT id, nome, categoria, preco FROM sabores WHERE ativo=1 ORDER BY categoria, nome'));
}));

// ─── MIDDLEWARE AUTH (protege todas as rotas abaixo) ──
app.use('/api', auth);

// ─── SABORES ─────────────────────────────────
app.get('/api/sabores', wrap(async (req, res) => {
  res.json(await db.all('SELECT * FROM sabores WHERE ativo=1 ORDER BY categoria, nome'));
}));

app.post('/api/sabores', wrap(async (req, res) => {
  const { nome, categoria, preco } = req.body;
  const r = await db.run('INSERT INTO sabores (nome,categoria,preco) VALUES (?,?,?)', [nome, categoria, preco]);
  res.json({ id: r.lastID, nome, categoria, preco });
}));

app.put('/api/sabores/:id', wrap(async (req, res) => {
  const { nome, categoria, preco, ativo } = req.body;
  await db.run('UPDATE sabores SET nome=?,categoria=?,preco=?,ativo=? WHERE id=?', [nome, categoria, preco, ativo ?? 1, req.params.id]);
  res.json({ ok: true });
}));

// ─── INGREDIENTES ─────────────────────────────
app.get('/api/ingredientes', wrap(async (req, res) => {
  res.json(await db.all('SELECT * FROM ingredientes ORDER BY nome'));
}));

app.post('/api/ingredientes', wrap(async (req, res) => {
  const { nome, unidade, preco_unitario, volume } = req.body;
  const r = await db.run('INSERT INTO ingredientes (nome,unidade,preco_unitario,volume) VALUES (?,?,?,?)', [nome, unidade, preco_unitario, volume]);
  res.json({ id: r.lastID });
}));

app.put('/api/ingredientes/:id', wrap(async (req, res) => {
  const { nome, unidade, preco_unitario, volume } = req.body;
  await db.run('UPDATE ingredientes SET nome=?,unidade=?,preco_unitario=?,volume=? WHERE id=?', [nome, unidade, preco_unitario, volume, req.params.id]);
  res.json({ ok: true });
}));

app.delete('/api/ingredientes/:id', wrap(async (req, res) => {
  await db.run('DELETE FROM ingredientes WHERE id=?', [req.params.id]);
  // Also delete from recipes
  await db.run('DELETE FROM receita_ingredientes WHERE ingrediente_id=?', [req.params.id]);
  res.json({ ok: true });
}));

// ─── RECEITAS ─────────────────────────────────
app.get('/api/receitas/:sabor_id', wrap(async (req, res) => {
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

app.post('/api/receitas/:sabor_id', wrap(async (req, res) => {
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


// ─── LANÇAMENTOS ─────────────────────────────
app.get('/api/lancamentos', wrap(async (req, res) => {
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

app.get('/api/lancamentos/datas', wrap(async (req, res) => {
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

app.post('/api/lancamentos', wrap(async (req, res) => {
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

app.delete('/api/lancamentos/:data', wrap(async (req, res) => {
  await db.run('DELETE FROM lancamentos WHERE data=?', [req.params.data]);
  res.json({ ok: true });
}));

// ─── ESTATÍSTICAS ─────────────────────────────
app.get('/api/stats/resumo-dia', wrap(async (req, res) => {
  let dia = req.query.data;
  
  // Se não informou data, pega o último dia lançado no banco
  if (!dia || dia === 'undefined') {
    const ultimo = await db.get('SELECT MAX(data) as data FROM lancamentos');
    dia = (ultimo && ultimo.data) ? ultimo.data : new Date().toISOString().slice(0, 10);
  }

  const mes = dia.substring(5, 7);
  const ano = dia.substring(0, 4);

  const lancamentos = await db.all(`
    SELECT l.*, s.nome as sabor_nome, s.preco, s.categoria,
      (CASE WHEN COALESCE(l.quantidade,0) > 0 THEN GREATEST(0, l.quantidade - l.voltaram) ELSE GREATEST(0, l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END) as vendidos
    FROM lancamentos l JOIN sabores s ON l.sabor_id=s.id WHERE l.data = ?`, [dia]);
  
  const totalVendidos = lancamentos.reduce((a,l) => a + (parseFloat(l.vendidos) || 0), 0);
  const receita = lancamentos.reduce((a,l) => a + ((parseFloat(l.vendidos) || 0) * parseFloat(l.preco)), 0);
  const totalProduzidos = lancamentos.reduce((a,l) => a + (l.fez || 0), 0);
  const totalPerdas = lancamentos.reduce((a,l) => a + (l.furou || 0), 0);

  const statsMes = await db.get(`
    SELECT
      SUM(CASE WHEN l.quantidade > 0 THEN GREATEST(0, l.quantidade - l.voltaram) ELSE GREATEST(0, l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END) as vendidos,
      COUNT(DISTINCT l.data) as dias,
      SUM((CASE WHEN l.quantidade > 0 THEN GREATEST(0, l.quantidade - l.voltaram) ELSE GREATEST(0, l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END) * s.preco) as receita
    FROM lancamentos l JOIN sabores s ON l.sabor_id = s.id
    WHERE SUBSTRING(l.data, 1, 7) = ?`, [`${ano}-${mes}`]);

  res.json({
    data: dia,
    totalVendidos,
    receita,
    totalProduzidos,
    totalPerdas,
    vendidosMes: parseFloat(statsMes?.vendidos || 0),
    receitaMes: parseFloat(statsMes?.receita || 0),
    diasTrabalhados: parseInt(statsMes?.dias || 0),
    lancamentos
  });
}));

app.get('/api/stats/resumo-mes', async (req, res) => {
  try {
    const agora = new Date();
    const m = String(req.query.mes || agora.getMonth()+1).padStart(2,'0');
    const a = String(req.query.ano || agora.getFullYear());
    const anoMes = `${a}-${m}`;

    let dias;
    try {
      dias = await db.all(`
        SELECT l.data,
          SUM(CASE WHEN l.quantidade > 0 THEN GREATEST(0, l.quantidade - l.voltaram) ELSE GREATEST(0, l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END) as vendidos,
          SUM((CASE WHEN l.quantidade > 0 THEN GREATEST(0, l.quantidade - l.voltaram) ELSE GREATEST(0, l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END)*s.preco) as receita,
          SUM(l.fez) as produzidos, SUM(l.furou) as perdas
        FROM lancamentos l JOIN sabores s ON l.sabor_id=s.id
        WHERE SUBSTRING(l.data, 1, 7) = ?
        GROUP BY l.data ORDER BY l.data`, [anoMes]);
    } catch(e) {
      return res.status(500).json({ erro: 'query dias: ' + e.message });
    }

    let porSabor;
    try {
      porSabor = await db.all(`
        SELECT s.nome, s.categoria,
          SUM(CASE WHEN l.quantidade > 0 THEN GREATEST(0, l.quantidade - l.voltaram) ELSE GREATEST(0, l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END) as vendidos,
          SUM((CASE WHEN l.quantidade > 0 THEN GREATEST(0, l.quantidade - l.voltaram) ELSE GREATEST(0, l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END)*s.preco) as receita
        FROM lancamentos l JOIN sabores s ON l.sabor_id=s.id
        WHERE SUBSTRING(l.data, 1, 7) = ?
        GROUP BY s.id ORDER BY vendidos DESC`, [anoMes]);
    } catch(e) {
      return res.status(500).json({ erro: 'query porSabor: ' + e.message });
    }

    const totais = dias.reduce((acc,d) => ({
      vendidos:   acc.vendidos   + Math.max(0, Number(d.vendidos)  || 0),
      receita:    acc.receita    + Math.max(0, Number(d.receita)   || 0),
      produzidos: acc.produzidos + Math.max(0, Number(d.produzidos)|| 0),
      perdas:     acc.perdas     + Math.max(0, Number(d.perdas)    || 0)
    }), { vendidos:0, receita:0, produzidos:0, perdas:0 });

    res.json({ mes: m, ano: a, dias, porSabor, totais, _v: 3 });
  } catch(e) {
    res.status(500).json({ erro: 'geral: ' + e.message });
  }
});

app.get('/api/stats/estoque-atual', wrap(async (req, res) => {
  res.json(await db.all(`
    SELECT s.id, s.nome, s.categoria, s.preco,
      COALESCE(l.estoque_final, 0) as estoque_atual, l.data as ultima_data
    FROM sabores s
    LEFT JOIN (
      SELECT DISTINCT ON (sabor_id) sabor_id, estoque_final, data
      FROM lancamentos
      ORDER BY sabor_id, data DESC
    ) l ON s.id = l.sabor_id
    WHERE s.ativo = 1
    ORDER BY s.nome`));
}));

app.get('/api/stats/evolucao-mensal', wrap(async (req, res) => {
  res.json(await db.all(`
    SELECT TO_CHAR(l.data::date, 'YYYY-MM') as mes,
      SUM(CASE WHEN l.quantidade > 0 THEN GREATEST(0, l.quantidade - l.voltaram) ELSE GREATEST(0, l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END) as vendidos,
      SUM((CASE WHEN l.quantidade > 0 THEN GREATEST(0, l.quantidade - l.voltaram) ELSE GREATEST(0, l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END)*s.preco) as receita,
      SUM(l.fez) as produzidos
    FROM lancamentos l JOIN sabores s ON l.sabor_id=s.id
    GROUP BY TO_CHAR(l.data::date, 'YYYY-MM') ORDER BY mes`));
}));

// ─── PRODUÇÃO (gasto + atualização de estoque) ───────────────────────────────
app.post('/api/producao', wrap(async (req, res) => {
  const { data, sabor_id, descricao, valor, geladinhos_produzidos } = req.body;
  if (!data || !sabor_id || !geladinhos_produzidos) return res.status(400).json({ erro: 'Dados incompletos' });
  const qtd = Math.max(0, parseInt(geladinhos_produzidos) || 0);

  // 1. Grava o gasto de produção
  const gasto = await db.run(
    'INSERT INTO gastos_producao (data,sabor_id,descricao,valor,geladinhos_produzidos) VALUES (?,?,?,?,?)',
    [data, sabor_id, descricao, valor, qtd]
  );

  // 2. Atualiza estoque via lancamentos
  const existing = await db.get(
    'SELECT * FROM lancamentos WHERE data=? AND sabor_id=?', [data, sabor_id]
  );

  if (existing) {
    // Já existe lançamento no dia: incrementa fez e estoque_final
    await db.run(
      'UPDATE lancamentos SET fez = fez + ?, estoque_final = estoque_final + ? WHERE data=? AND sabor_id=?',
      [qtd, qtd, data, sabor_id]
    );
  } else {
    // Sem lançamento no dia: busca último estoque_final conhecido como estoque_inicial
    const ultimo = await db.get(
      'SELECT estoque_final FROM lancamentos WHERE sabor_id=? AND data < ? ORDER BY data DESC LIMIT 1',
      [sabor_id, data]
    );
    const estoqueInicial = ultimo ? (parseInt(ultimo.estoque_final) || 0) : 0;
    await db.run(
      `INSERT INTO lancamentos (data,sabor_id,estoque_inicial,fez,furou,quantidade,voltaram,estoque_final)
       VALUES (?,?,?,?,0,0,0,?)`,
      [data, sabor_id, estoqueInicial, qtd, estoqueInicial + qtd]
    );
  }

  res.json({ ok: true, gasto_id: gasto.lastID });
}));

// ─── GASTOS ──────────────────────────────────
app.get('/api/gastos', wrap(async (req, res) => {
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

app.post('/api/gastos', wrap(async (req, res) => {
  const { data, sabor_id, descricao, valor, geladinhos_produzidos } = req.body;
  const r = await db.run('INSERT INTO gastos_producao (data,sabor_id,descricao,valor,geladinhos_produzidos) VALUES (?,?,?,?,?)',
    [data, sabor_id||null, descricao, valor, geladinhos_produzidos||0]);
  res.json({ id: r.lastID });
}));

app.delete('/api/gastos/:id', wrap(async (req, res) => {
  await db.run('DELETE FROM gastos_producao WHERE id=?', [req.params.id]);
  res.json({ ok: true });
}));

// ─── AJUSTE DE ESTOQUE ────────────────────────
app.post('/api/estoque/ajustar', wrap(async (req, res) => {
  const { sabor_id, nova_quantidade, data } = req.body;
  // Usar horário local (não UTC) para evitar bug de fuso horário
  const agora = new Date();
  const diaLocal = `${agora.getFullYear()}-${String(agora.getMonth()+1).padStart(2,'0')}-${String(agora.getDate()).padStart(2,'0')}`;
  const dia = data || diaLocal;
  const qty = Math.max(0, parseInt(nova_quantidade) || 0);

  const existing = await db.get(
    'SELECT * FROM lancamentos WHERE data=? AND sabor_id=?', [dia, sabor_id]
  );

  if (existing) {
    // Atualiza o estoque_final do lançamento existente
    await db.run(
      'UPDATE lancamentos SET estoque_final=? WHERE data=? AND sabor_id=?',
      [qty, dia, sabor_id]
    );
  } else {
    // Cria um lançamento de ajuste para hoje
    await db.run(
      `INSERT INTO lancamentos (data,sabor_id,estoque_inicial,fez,furou,quantidade,voltaram,estoque_final)
       VALUES (?,?,?,0,0,0,0,?)`,
      [dia, sabor_id, qty, qty]
    );
  }
  res.json({ ok: true, sabor_id, nova_quantidade: qty, data: dia });
}));

// ─── IMPORTAÇÃO ───────────────────────────────
app.post('/api/importar', wrap(async (req, res) => {
  const { lancamentos } = req.body;
  if (!lancamentos?.length) return res.status(400).json({ erro: 'Sem dados' });
  let ok = 0, erros = 0;
  for (const item of lancamentos) {
    try {
      await db.run(`INSERT INTO lancamentos (data,sabor_id,estoque_inicial,fez,furou,voltaram,estoque_final,quantidade)
        VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(data,sabor_id) DO UPDATE SET
          estoque_inicial=excluded.estoque_inicial,fez=excluded.fez,
          furou=excluded.furou,voltaram=excluded.voltaram,
          estoque_final=excluded.estoque_final,quantidade=excluded.quantidade`,
        [item.data, item.sabor_id, item.estoque_inicial, item.fez, item.furou, item.voltaram, item.estoque_final, item.quantidade ?? 0]);
      ok++;
    } catch { erros++; }
  }
  res.json({ ok, erros });
}));

// ─── FLUXO DE CAIXA ──────────────────────────────
app.get('/api/fluxo-caixa', wrap(async (req, res) => {
  const { mes, ano } = req.query;
  const p = [parseInt(mes), parseInt(ano)];

  // Entradas: vendas dos lançamentos
  const vendas = await db.all(`
    SELECT l.data, s.nome as descricao, 'entrada' as tipo, 'Vendas' as categoria,
      GREATEST(0, CASE WHEN l.quantidade > 0 THEN (l.quantidade - l.voltaram)
        ELSE (l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END) * s.preco::numeric as valor
    FROM lancamentos l JOIN sabores s ON l.sabor_id = s.id
    WHERE EXTRACT(MONTH FROM l.data::date) = ? AND EXTRACT(YEAR FROM l.data::date) = ?
      AND GREATEST(0, CASE WHEN l.quantidade > 0 THEN (l.quantidade - l.voltaram)
        ELSE (l.estoque_inicial + l.fez - l.furou - l.voltaram - l.estoque_final) END) > 0
  `, p);

  // Saídas: gastos de produção
  const gastos = await db.all(`
    SELECT g.data, COALESCE('Produção: ' || s.nome, g.descricao, 'Gasto avulso') as descricao,
      'saida' as tipo, 'Produção' as categoria, g.valor
    FROM gastos_producao g LEFT JOIN sabores s ON g.sabor_id = s.id
    WHERE EXTRACT(MONTH FROM g.data::date) = ? AND EXTRACT(YEAR FROM g.data::date) = ?
  `, p);

  // Lançamentos avulsos
  const avulsos = await db.all(`
    SELECT id, data, descricao, tipo, categoria, valor
    FROM fluxo_caixa_avulso
    WHERE EXTRACT(MONTH FROM data::date) = ? AND EXTRACT(YEAR FROM data::date) = ?
  `, p);

  // Combinar e ordenar por data
  const todos = [
    ...vendas.map(r => ({ ...r, origem: 'lancamento' })),
    ...gastos.map(r => ({ ...r, origem: 'gasto' })),
    ...avulsos.map(r => ({ ...r, origem: 'avulso' }))
  ].sort((a, b) => a.data.localeCompare(b.data));

  // Calcular saldo acumulado
  let saldo = 0;
  todos.forEach(r => {
    saldo += r.tipo === 'entrada' ? r.valor : -r.valor;
    r.saldo = Math.round(saldo * 100) / 100;
  });

  res.json(todos);
}));

app.post('/api/fluxo-caixa/avulso', wrap(async (req, res) => {
  const { data, descricao, tipo, categoria, valor } = req.body;
  if (!data || !descricao || !tipo || !valor) return res.status(400).json({ erro: 'Campos obrigatórios: data, descricao, tipo, valor' });
  const r = await db.run(
    'INSERT INTO fluxo_caixa_avulso (data,descricao,tipo,categoria,valor) VALUES (?,?,?,?,?)',
    [data, descricao, tipo, categoria || null, parseFloat(valor)]
  );
  res.json({ id: r.lastID });
}));

app.delete('/api/fluxo-caixa/avulso/:id', wrap(async (req, res) => {
  await db.run('DELETE FROM fluxo_caixa_avulso WHERE id=?', [req.params.id]);
  res.json({ ok: true });
}));

// ─── EXPORTAR PARA VERCEL ─────────────────────────
// Em ambiente local, você ainda pode rodar com 'node server.js'
if (require.main === module) {
  inicializar().then(async () => {
    await seedUsuarios();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Servidor local rodando em http://localhost:${PORT}`);
    });
  }).catch(err => {
    console.error('Erro ao inicializar:', err);
    process.exit(1);
  });
}

module.exports = app;
