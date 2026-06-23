const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && (process.env.DATABASE_URL.includes('supabase.com') || process.env.DATABASE_URL.includes('pooler') || !process.env.DATABASE_URL.includes('localhost')) 
    ? { rejectUnauthorized: false } 
    : false
});

class Database {
  _replaceParams(sql) {
    let i = 1;
    return sql.replace(/\?/g, () => `$${i++}`);
  }

  async run(sql, params = []) {
    let pgSql = this._replaceParams(sql);
    
    // Adicionar RETURNING id para comandos INSERT automaticamente para simular lastID
    const isInsert = pgSql.trim().toUpperCase().startsWith('INSERT');
    if (isInsert && !pgSql.toUpperCase().includes('RETURNING ID')) {
      pgSql += ' RETURNING id';
    }

    const res = await pool.query(pgSql, params);
    let lastID = null;
    if (res.rows && res.rows.length > 0 && res.rows[0].id) {
      lastID = res.rows[0].id;
    }
    return { lastID, changes: res.rowCount };
  }

  async all(sql, params = []) {
    const pgSql = this._replaceParams(sql);
    const res = await pool.query(pgSql, params);
    return res.rows;
  }

  async get(sql, params = []) {
    const pgSql = this._replaceParams(sql);
    const res = await pool.query(pgSql, params);
    return res.rows[0];
  }

  async exec(sql) {
    return pool.query(sql);
  }
}

const db = new Database();

async function inicializar() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sabores (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL UNIQUE,
      categoria TEXT NOT NULL,
      preco REAL NOT NULL,
      ativo INTEGER NOT NULL DEFAULT 1,
      rendimento_receita INTEGER NOT NULL DEFAULT 20,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS lancamentos (
      id SERIAL PRIMARY KEY,
      data TEXT NOT NULL,
      sabor_id INTEGER NOT NULL REFERENCES sabores(id),
      estoque_inicial INTEGER NOT NULL DEFAULT 0,
      fez INTEGER NOT NULL DEFAULT 0,
      furou INTEGER NOT NULL DEFAULT 0,
      voltaram INTEGER NOT NULL DEFAULT 0,
      estoque_final INTEGER NOT NULL DEFAULT 0,
      quantidade INTEGER NOT NULL DEFAULT 0,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(data, sabor_id)
    );

    CREATE TABLE IF NOT EXISTS ingredientes (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      unidade TEXT NOT NULL,
      preco_unitario REAL NOT NULL DEFAULT 0,
      volume REAL NOT NULL DEFAULT 1,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS gastos_producao (
      id SERIAL PRIMARY KEY,
      data TEXT NOT NULL,
      sabor_id INTEGER REFERENCES sabores(id),
      descricao TEXT,
      valor REAL NOT NULL DEFAULT 0,
      geladinhos_produzidos INTEGER DEFAULT 0,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS receita_ingredientes (
      id SERIAL PRIMARY KEY,
      sabor_id INTEGER NOT NULL REFERENCES sabores(id),
      ingrediente_id INTEGER NOT NULL REFERENCES ingredientes(id),
      quantidade REAL NOT NULL DEFAULT 0,
      UNIQUE(sabor_id, ingrediente_id)
    );

    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      deve_trocar_senha BOOLEAN NOT NULL DEFAULT TRUE
    );

    CREATE TABLE IF NOT EXISTS fluxo_caixa_avulso (
      id SERIAL PRIMARY KEY,
      data TEXT NOT NULL,
      descricao TEXT NOT NULL,
      tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
      categoria TEXT,
      valor REAL NOT NULL DEFAULT 0,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pedidos (
      id SERIAL PRIMARY KEY,
      cliente_nome TEXT NOT NULL,
      telefone TEXT NOT NULL,
      itens TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'em_producao', 'entregue', 'cancelado')),
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pontos_venda (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL UNIQUE,
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS transferencias_estoque (
      id SERIAL PRIMARY KEY,
      data TEXT NOT NULL,
      sabor_id INTEGER NOT NULL REFERENCES sabores(id),
      ponto_origem_id INTEGER NOT NULL REFERENCES pontos_venda(id),
      ponto_destino_id INTEGER NOT NULL REFERENCES pontos_venda(id),
      quantidade INTEGER NOT NULL CHECK (quantidade > 0),
      observacao TEXT,
      usuario TEXT,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CHECK (ponto_origem_id != ponto_destino_id)
    );
  `);

  // Adicionar ponto_id nas tabelas existentes (idempotente)
  const addColumns = [
    "ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS ponto_id INTEGER NOT NULL DEFAULT 1 REFERENCES pontos_venda(id)",
    "ALTER TABLE gastos_producao ADD COLUMN IF NOT EXISTS ponto_id INTEGER NOT NULL DEFAULT 1 REFERENCES pontos_venda(id)",
    "ALTER TABLE fluxo_caixa_avulso ADD COLUMN IF NOT EXISTS ponto_id INTEGER NOT NULL DEFAULT 1 REFERENCES pontos_venda(id)",
    "ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS ponto_id INTEGER NOT NULL DEFAULT 1 REFERENCES pontos_venda(id)"
  ];
  for (const sql of addColumns) {
    try { await db.exec(sql); } catch(e) { /* coluna já existe */ }
  }

  // Atualizar constraint UNIQUE de lancamentos para incluir ponto_id
  try {
    await db.exec("ALTER TABLE lancamentos DROP CONSTRAINT IF EXISTS lancamentos_data_sabor_id_key");
    await db.exec("ALTER TABLE lancamentos DROP CONSTRAINT IF EXISTS lancamentos_data_sabor_ponto_key");
    await db.exec("ALTER TABLE lancamentos ADD CONSTRAINT lancamentos_data_sabor_ponto_key UNIQUE(data, sabor_id, ponto_id)");
  } catch(e) { /* constraint já existe */ }

  // Seed pontos de venda
  const pontosExistem = await db.get('SELECT COUNT(*) as c FROM pontos_venda');
  if (parseInt(pontosExistem.c) === 0) {
    await db.run("INSERT INTO pontos_venda (nome) VALUES (?)", ['Gigi']);
    await db.run("INSERT INTO pontos_venda (nome) VALUES (?)", ['Jajá']);
    console.log('✅ Pontos de venda cadastrados (Gigi, Jajá)!');
  }

  const row = await db.get('SELECT COUNT(*) as c FROM sabores');
  if (parseInt(row.c) === 0) {
    const sabores = [
      ['Abacate','fruta',6],['Abacaxi','fruta',6],['Açaí','fruta',6],
      ['Buriti','fruta',6],['Coco','fruta',6],['Coco Queimado','fruta',6],
      ['Cupuaçu','fruta',6],['Maracujá','fruta',6],['Milho Verde','fruta',6],
      ['Morango','fruta',6],['Uva','fruta',6],
      ['Amendoim','doce_especial',6],['Brigadeiro','doce_especial',6],
      ['Maracujá com Nutella','doce_especial',6],['Morango com Nutella','doce_especial',6],
      ['Mousse de Limão','doce_especial',6],['Ninho com Nutella','doce_especial',6],
      ['Ninho com Morango','doce_especial',6],['Oreo','doce_especial',6],
      ['Prestígio','doce_especial',6],['Pudim','doce_especial',6],
      ['Zero Lactose Coco','zero_lactose',7],['Zero Lactose Morango','zero_lactose',7],
    ];
    for (const [nome, cat, preco] of sabores) {
      await db.run('INSERT INTO sabores (nome, categoria, preco) VALUES (?,?,?)', [nome, cat, preco]);
    }
    console.log('✅ Sabores base cadastrados!');
  }

  console.log('✅ Banco de dados Postgres pronto!');
}

module.exports = { db, inicializar };
