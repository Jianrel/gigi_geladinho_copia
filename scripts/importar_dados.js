/**
 * Script de importação dos dados da planilha Excel para o banco SQLite
 * Execute: npm run importar
 */

const XLSX = require('xlsx');
const path = require('path');
const { db, inicializar } = require('../database');

const XLSX_PATH = path.join(__dirname, '..', 'Vendas do Gigi 2.0 - 2026.xlsx');

const MAPA_SABORES = {
  'Abacate': 'Abacate', 'Abacaxi': 'Abacaxi', 'Açaí': 'Açaí',
  'Amendoim': 'Amendoim', 'Brigadeiro': 'Brigadeiro', 'Buriti': 'Buriti',
  'Coco': 'Coco', 'Coco Queimado': 'Coco Queimado',
  'Cupuaçu': 'Cupuaçu', 'Cupuacu': 'Cupuaçu',
  'Maracujá': 'Maracujá', 'Maracuja': 'Maracujá',
  'Maracujá com nutella': 'Maracujá com Nutella',
  'Maracujá com Nutella': 'Maracujá com Nutella',
  'Milho verde': 'Milho Verde', 'Milho Verde': 'Milho Verde',
  'Morango': 'Morango',
  'Morango com Nutella': 'Morango com Nutella',
  'Morango com nutella': 'Morando com Nutella',
  'Mousse de limão ': 'Mousse de Limão',
  'Mousse de limão': 'Mousse de Limão',
  'Mousse de Limão': 'Mousse de Limão',
  'Ninho com Nutella': 'Ninho com Nutella',
  'Ninho com Morango': 'Ninho com Morango',
  'Oreo': 'Oreo', 'Prestígio': 'Prestígio', 'Prestigio': 'Prestígio',
  'Pudim': 'Pudim', 'Uva': 'Uva',
  'Zero lactose coco': 'Zero Lactose Coco',
  'Zero lactose morango': 'Zero Lactose Morango',
  'Zero lactose': 'Zero Lactose Coco',
};

// Corrige typo no mapa
MAPA_SABORES['Morando com Nutella'] = 'Morango com Nutella';

function converterData(texto) {
  const match = String(texto).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

// Estrutura real da planilha:
// Col 0: SABORES (nome do sabor em cada linha)
// Col 1: Estoque Inicial
// Col 2: Furou
// Col 3: Fez
// Col 4: Quantidade de Geladinhos (não usada)
// Col 5: Voltaram
// Col 6: Vendidos (calculado)
// Col 7: Estoque Final
// Col 8: R$ (valor)
// A data está na linha onde col[1] contém "Data: DD/MM/YYYY"

function parsearAbaMes(worksheet, saboresMap) {
  const dados = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  const lancamentos = [];
  let dataAtual = null;

  for (const row of dados) {
    // Procurar data em qualquer coluna da linha
    let dataEncontrada = null;
    for (const cell of row) {
      const s = String(cell || '');
      if (s.startsWith('Data:')) { dataEncontrada = converterData(s); break; }
    }
    if (dataEncontrada) { dataAtual = dataEncontrada; continue; }

    // Linha de cabeçalho (SABORES)
    if (String(row[0] || '').trim() === 'SABORES') continue;

    // Linha de sabor
    if (!dataAtual) continue;
    const nomePlanilha = String(row[0] || '').trim();
    if (!nomePlanilha || nomePlanilha === 'TOTAL' || nomePlanilha === 'Saldo' || nomePlanilha.startsWith('Valor')) continue;

    const nomeBanco = MAPA_SABORES[nomePlanilha];
    if (!nomeBanco || !saboresMap[nomeBanco]) continue;

    const pn = v => { const n = parseInt(v); return isNaN(n) ? 0 : Math.max(0, n); };

    // Conforme estrutura descoberta: EI=1, Furou=2, Fez=3, Volt=5, EF=7
    lancamentos.push({
      data: dataAtual,
      sabor_id: saboresMap[nomeBanco],
      estoque_inicial: pn(row[1]),
      fez: pn(row[3]),
      furou: pn(row[2]),
      voltaram: pn(row[5]),
      estoque_final: pn(row[7])
    });
  }
  return lancamentos;
}

async function importar() {
  await inicializar();

  const saboresRows = await db.all('SELECT id, nome FROM sabores');
  const saboresMap = {};
  saboresRows.forEach(s => { saboresMap[s.nome] = s.id; });

  console.log('\n📂 Carregando planilha:', XLSX_PATH);
  const workbook = XLSX.readFile(XLSX_PATH);
  const abas = workbook.SheetNames.filter(n => !n.includes('GASTOS') && !n.includes('CONTROLE'));
  console.log('📋 Abas:', abas.join(', '));

  const todos = [];
  for (const aba of abas) {
    const ws = workbook.Sheets[aba];
    const lancs = parsearAbaMes(ws, saboresMap);
    console.log(`  ✅ ${aba}: ${lancs.length} lançamentos`);
    todos.push(...lancs);
  }

  console.log(`\n💾 Importando ${todos.length} lançamentos...`);
  let ok = 0, erros = 0;
  for (const item of todos) {
    try {
      await db.run(`
        INSERT INTO lancamentos (data,sabor_id,estoque_inicial,fez,furou,voltaram,estoque_final)
        VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(data,sabor_id) DO UPDATE SET
          estoque_inicial=excluded.estoque_inicial, fez=excluded.fez,
          furou=excluded.furou, voltaram=excluded.voltaram, estoque_final=excluded.estoque_final`,
        [item.data, item.sabor_id, item.estoque_inicial, item.fez, item.furou, item.voltaram, item.estoque_final]);
      ok++;
    } catch (e) { console.error('  ❌', e.message, JSON.stringify(item)); erros++; }
  }
  console.log(`\n🎉 Concluído! ${ok} importados, ${erros} erros.\n`);
  process.exit(0);
}

importar().catch(e => { console.error(e); process.exit(1); });
