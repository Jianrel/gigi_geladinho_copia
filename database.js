const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'gigi_estoque.db');

// Wrapper de Promise sobre sqlite3
class Database {
  constructor(filePath) {
    this.db = new sqlite3.Database(filePath);
    this.db.run('PRAGMA journal_mode = WAL');
    this.db.run('PRAGMA foreign_keys = ON');
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  exec(sql) {
    return new Promise((resolve, reject) => {
      this.db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

const db = new Database(DB_PATH);

async function inicializar() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sabores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL UNIQUE,
      categoria TEXT NOT NULL,
      preco REAL NOT NULL,
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS lancamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data TEXT NOT NULL,
      sabor_id INTEGER NOT NULL REFERENCES sabores(id),
      estoque_inicial INTEGER NOT NULL DEFAULT 0,
      fez INTEGER NOT NULL DEFAULT 0,
      furou INTEGER NOT NULL DEFAULT 0,
      voltaram INTEGER NOT NULL DEFAULT 0,
      estoque_final INTEGER NOT NULL DEFAULT 0,
      criado_em TEXT DEFAULT (datetime('now', 'localtime')),
      UNIQUE(data, sabor_id)
    );

    CREATE TABLE IF NOT EXISTS ingredientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      unidade TEXT NOT NULL,
      preco_unitario REAL NOT NULL DEFAULT 0,
      volume REAL NOT NULL DEFAULT 1,
      criado_em TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS gastos_producao (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data TEXT NOT NULL,
      sabor_id INTEGER REFERENCES sabores(id),
      descricao TEXT,
      valor REAL NOT NULL DEFAULT 0,
      geladinhos_produzidos INTEGER DEFAULT 0,
      criado_em TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS receita_ingredientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sabor_id INTEGER NOT NULL REFERENCES sabores(id),
      ingrediente_id INTEGER NOT NULL REFERENCES ingredientes(id),
      quantidade REAL NOT NULL DEFAULT 0,
      UNIQUE(sabor_id, ingrediente_id)
    );
  `);

  // Migração: adicionar coluna rendimento_receita
  try {
    await db.run('ALTER TABLE sabores ADD COLUMN rendimento_receita INTEGER NOT NULL DEFAULT 20');
    console.log('✅ Coluna rendimento_receita adicionada!');
  } catch (e) {
    // Coluna já existe
  }

  // Migração: adicionar coluna quantidade se não existir
  try {
    await db.run('ALTER TABLE lancamentos ADD COLUMN quantidade INTEGER NOT NULL DEFAULT 0');
    console.log('✅ Coluna quantidade adicionada!');
  } catch (e) {
    // Coluna já existe, tudo certo
  }

  const row = await db.get('SELECT COUNT(*) as c FROM sabores');
  if (row.c === 0) {
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
    console.log('✅ Sabores cadastrados!');
  }

  console.log('✅ Banco de dados pronto:', DB_PATH);
}

module.exports = { db, inicializar };
