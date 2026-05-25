/* ═══════════════════════════════════════════
   app.js — Gigi Geladinho Gourmet
   Parte 1: Utilitários, navegação, dashboard
═══════════════════════════════════════════ */

// ─── ESTADO GLOBAL ───────────────────────────
const state = {
  sabores: [],
  ingredientes: [],
  receitaAtualIngr: [],
  receitaCustoTotal: 0,
  receitaRendimento: 20,
  paginaAtual: 'dashboard',
  charts: {}
};

Chart.register(ChartDataLabels);
Chart.defaults.set('plugins.datalabels', {
  color: '#333',
  font: { weight: 'bold', size: 11 },
  anchor: 'end',
  align: 'top',
  formatter: (value) => value > 0 ? value : ''
});

// ─── UTILITÁRIOS ─────────────────────────────
const $ = id => document.getElementById(id);
const fmt = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
const fmtNum = v => Number(v || 0).toLocaleString('pt-BR');
const hoje = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

async function api(path, opts = {}) {
  const token = localStorage.getItem('gigi_token');
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (res.status === 401) {
    localStorage.removeItem('gigi_token');
    localStorage.removeItem('gigi_usuario');
    $('login-overlay').style.display = 'flex';
    return null;
  }
  return res.json();
}

function toast(msg, tipo = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${tipo}`;
  t.textContent = msg;
  $('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function catLabel(c) {
  return { fruta: '🍉 Fruta', doce_especial: '🍫 Doce Especial', zero_lactose: '🥛 Zero Lactose' }[c] || c;
}

function destroyChart(id) {
  if (state.charts[id]) { state.charts[id].destroy(); delete state.charts[id]; }
}

// ─── NAVEGAÇÃO ───────────────────────────────
function navegar(pagina) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pg = $(`page-${pagina}`);
  const nav = $(`nav-${pagina}`);
  if (pg) pg.classList.add('active');
  if (nav) nav.classList.add('active');
  state.paginaAtual = pagina;
  // Fechar sidebar mobile
  document.getElementById('sidebar').classList.remove('open');
  // Carregar dados da página
  const loaders = {
    dashboard: carregarDashboard,
    lancamento: carregarLancamento,
    estoque: carregarEstoque,
    relatorios: carregarRelatorios,
    gastos: carregarGastos,
    sabores: carregarSabores
  };
  if (loaders[pagina]) loaders[pagina]();
}

document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    navegar(el.dataset.page);
  });
});

$('sidebar-toggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// Atualizar data na sidebar
function atualizarDataSidebar() {
  const d = new Date();
  const opts = { weekday: 'short', day: '2-digit', month: 'short' };
  $('data-atual').textContent = d.toLocaleDateString('pt-BR', opts);
}
atualizarDataSidebar();

// ─── DASHBOARD ───────────────────────────────
async function carregarDashboard() {
  const dataEl = $('dash-data');
  const isMes = !dataEl.value;
  const dtRef = dataEl.value || 'undefined';

  // Busca o resumo do dia primeiro para obter a data real do último lançamento
  const resumoDia = await api(`/api/stats/resumo-dia?data=${dtRef}`);
  const dataFinal = resumoDia?.data || hoje();
  const refDate = new Date(dataFinal + 'T12:00:00');
  const mes = String(refDate.getMonth() + 1);
  const ano = String(refDate.getFullYear());

  const [evolucao, estoqueAtual, resumoMes] = await Promise.all([
    api('/api/stats/evolucao-mensal'),
    api('/api/stats/estoque-atual'),
    api(`/api/stats/resumo-mes?mes=${mes}&ano=${ano}`)
  ]);
  if (isMes && resumoDia.data) {
    // Manter isMes true mas usar os totais que o servidor calculou
  }

  // Labels dinâmicos
  $('stat-vendidos').nextElementSibling.textContent = isMes ? 'Vendidos no Mês' : 'Vendidos no Dia';
  $('stat-receita').nextElementSibling.textContent = isMes ? 'Receita do Mês' : 'Receita do Dia';
  $('stat-produzidos').nextElementSibling.textContent = isMes ? 'Produzidos no Mês' : 'Produzidos no Dia';
  $('stat-furou').nextElementSibling.textContent = isMes ? 'Perdas no Mês' : 'Perdas no Dia';
  
  // Ocultar card duplicado de receita do mês na visão mensal
  $('stat-receita-mes').parentElement.parentElement.style.display = isMes ? 'none' : 'flex';

  // Valores
  const totaisMes = resumoMes?.totais || {};
  if (isMes) {
    $('stat-vendidos').textContent = fmtNum(totaisMes.vendidos);
    $('stat-receita').textContent = fmt(totaisMes.receita);
    $('stat-produzidos').textContent = fmtNum(totaisMes.produzidos);
    $('stat-furou').textContent = fmtNum(totaisMes.perdas);
  } else {
    $('stat-vendidos').textContent = fmtNum(resumoDia.totalVendidos);
    $('stat-receita').textContent = fmt(resumoDia.receita);
    $('stat-produzidos').textContent = fmtNum(resumoDia.totalProduzidos);
    $('stat-furou').textContent = fmtNum(resumoDia.totalFurou);
  }
  
  const totalEstoqueHoje = (estoqueAtual || []).reduce((a, s) => a + (parseFloat(s.estoque_atual) || 0), 0);
  $('stat-estoque').textContent = fmtNum(totalEstoqueHoje);
  $('stat-receita-mes').textContent = fmt(resumoDia.receitaMes);

  // Gráfico: vendas por sabor hoje ou no mês
  $('chart-sabores-dia').parentElement.previousElementSibling.textContent = isMes ? 'Top 10 mais vendidas — Mês Atual' : 'Top 10 mais vendidas — Dia Selecionado';
  const lancsGrafico = isMes ? (resumoMes?.porSabor || []) : (resumoDia?.lancamentos || []);
  const dadosGrafico = lancsGrafico.filter(l => (parseFloat(l.vendidos) || 0) > 0).sort((a, b) => (parseFloat(b.vendidos) || 0) - (parseFloat(a.vendidos) || 0)).slice(0, 10);
  
  destroyChart('chart-sabores-dia');
  if (dadosGrafico.length) {
    state.charts['chart-sabores-dia'] = new Chart($('chart-sabores-dia'), {
      type: 'bar',
      data: {
        labels: dadosGrafico.map(l => l.nome || l.sabor_nome),
        datasets: [{
          label: 'Vendidos',
          data: dadosGrafico.map(l => Math.max(0, l.vendidos)),
          backgroundColor: dadosGrafico.map(l =>
            l.categoria === 'fruta' ? '#5BB894' :
            l.categoria === 'doce_especial' ? '#F5C518' : '#2DB8C8'),
          borderRadius: 6
        }]
      },
      options: { responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 25 } },
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
      }
    });
  }

  // Gráfico: receita diária do mês
  destroyChart('chart-receita-mes');
  if ((resumoMes?.dias || []).length) {
    state.charts['chart-receita-mes'] = new Chart($('chart-receita-mes'), {
      type: 'line',
      data: {
        labels: (resumoMes.dias || []).map(d => d.data.slice(8)),
        datasets: [{
          label: 'Receita (R$)',
          data: (resumoMes.dias || []).map(d => Math.max(0, d.receita)),
          borderColor: '#5BB894', backgroundColor: 'rgba(91,184,148,0.15)',
          fill: true, tension: 0.4, pointRadius: 4, pointHoverRadius: 6
        }]
      },
      options: { responsive: true, maintainAspectRatio: false,
        layout: { padding: { left: 10, right: 25, top: 20 } },
        plugins: { 
          legend: { display: false },
          datalabels: { display: false }
        },
        scales: { y: { beginAtZero: true } }
      }
    });
  }


}

$('dash-data').addEventListener('change', carregarDashboard);
$('btn-dash-mes').addEventListener('click', () => { $('dash-data').value = ''; carregarDashboard(); });

// ─── LANÇAMENTO DIÁRIO ───────────────────────
async function carregarLancamento() {
  if (!state.sabores.length) state.sabores = await api('/api/sabores');
  const dataEl = $('lanc-data');
  if (!dataEl.value) dataEl.value = hoje();
  await renderizarTabelaLancamento(dataEl.value);
}

async function renderizarTabelaLancamento(data) {
  const lancamentos = await api(`/api/lancamentos?data=${data}`);
  const lancMap = {};
  lancamentos.forEach(l => { lancMap[l.sabor_id] = l; });

  const tbody = $('lancamento-tbody');
  tbody.innerHTML = '';

  const cats = ['fruta', 'doce_especial', 'zero_lactose'];
  const catNomes = { fruta: '🍉 Frutas', doce_especial: '🍫 Doces Especiais', zero_lactose: '🥛 Zero Lactose' };

  cats.forEach(cat => {
    const saboresCat = state.sabores.filter(s => s.categoria === cat);
    if (!saboresCat.length) return;

    const sepRow = document.createElement('tr');
    sepRow.innerHTML = `<td colspan="8" style="background:var(--azul-light);font-weight:800;font-size:0.78rem;color:var(--azul);padding:7px 14px;text-transform:uppercase;letter-spacing:.05em">${catNomes[cat]}</td>`;
    tbody.appendChild(sepRow);

    saboresCat.forEach(s => {
      const l = lancMap[s.id] || {};
      const row = document.createElement('tr');
      row.dataset.saborId = s.id;
      row.dataset.preco = s.preco;
      const v = val => (val !== null && val !== undefined) ? val : '';
      row.innerHTML = `
        <td class="col-sabor">${s.nome}</td>
        <td><input type="number" class="f-inicial" min="0" value="${l.estoque_inicial ?? 0}"></td>
        <td><input type="number" class="f-fez" min="0" value="${v(l.fez)}"></td>
        <td><input type="number" class="f-furou" min="0" value="${v(l.furou)}"></td>
        <td><input type="number" class="f-quantidade" min="0" value="${v(l.quantidade)}" title="Qtd. de geladinhos levados no dia"></td>
        <td><input type="number" class="f-voltaram" min="0" value="${v(l.voltaram)}"></td>
        <td class="calc vendidos-cell">0</td>
        <td class="calc final-cell">0</td>
        <td class="calc valor-cell">R$ 0,00</td>
      `;
      tbody.appendChild(row);
      calcularLinha(row);
      row.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => { calcularLinha(row); atualizarTotais(); }));
    });
  });
  atualizarTotais();
}

function calcularLinha(row) {
  const g = cls => parseInt(row.querySelector(cls)?.value) || 0;
  const ei       = g('.f-inicial');
  const fez      = g('.f-fez');
  const furou    = g('.f-furou');
  const qtd      = g('.f-quantidade');
  
  const voltInput = row.querySelector('.f-voltaram');
  const voltaramStr = voltInput.value.trim();
  const voltaram = parseInt(voltaramStr) || 0;
  const preco = parseFloat(row.dataset.preco) || 0;

  // Só mostra Valor R$ e Vendidos se tiver preenchido a quantidade E o voltaram
  if (qtd > 0 && voltaramStr === '') {
    row.querySelector('.vendidos-cell').textContent = '-';
    row.querySelector('.final-cell').textContent    = '-';
    row.querySelector('.valor-cell').textContent    = '-';
  } else {
    // Vendidos = Qtd.Dia - Voltaram
    const vendidos = Math.max(0, qtd - voltaram);
    // Estoque Final = EI + Fez - Furou - Qtd.Dia + Voltaram
    const estoqueFinal = Math.max(0, ei + fez - furou - qtd + voltaram);

    row.querySelector('.vendidos-cell').textContent = vendidos;
    row.querySelector('.final-cell').textContent    = estoqueFinal;
    row.querySelector('.valor-cell').textContent    = fmt(vendidos * preco);
  }
}

function atualizarTotais() {
  const rows = document.querySelectorAll('#lancamento-tbody tr[data-sabor-id]');
  let ini=0,fez=0,furou=0,qtd=0,volt=0,vend=0,fin=0,val=0;
  rows.forEach(row => {
    const g = cls => parseInt(row.querySelector(cls)?.value) || 0;
    const preco = parseFloat(row.dataset.preco) || 0;
    const vText = row.querySelector('.vendidos-cell')?.textContent;
    const efText = row.querySelector('.final-cell')?.textContent;
    
    const v   = parseInt(vText) || 0;
    const ef  = parseInt(efText) || 0;
    
    ini += g('.f-inicial'); fez += g('.f-fez'); furou += g('.f-furou');
    qtd += g('.f-quantidade'); volt += g('.f-voltaram');
    
    // Apenas soma os vendidos/estoque final/valor se não estiverem '-'
    if (vText !== '-') {
      vend += v; val += v * preco;
    }
    if (efText !== '-') {
      fin += ef;
    }
  });
  $('tot-inicial').textContent  = ini;  $('tot-fez').textContent      = fez;
  $('tot-furou').textContent    = furou; $('tot-quantidade').textContent = qtd;
  $('tot-voltaram').textContent = volt;
  $('tot-vendidos').textContent = vend;  $('tot-final').textContent    = fin;
  $('tot-valor').textContent    = fmt(val);
}

async function salvarLancamento() {
  const data = $('lanc-data').value;
  if (!data) return toast('Selecione uma data!', 'error');
  const rows = document.querySelectorAll('#lancamento-tbody tr[data-sabor-id]');
  const payload = [];
  rows.forEach(row => {
    const g = cls => Math.max(0, parseInt(row.querySelector(cls)?.value) || 0);
    const ei = g('.f-inicial');
    const fez = g('.f-fez');
    const furou = g('.f-furou');
    const qtd = g('.f-quantidade');
    const voltaram = g('.f-voltaram');
    const estoqueFinalCalculado = Math.max(0, ei + fez - furou - qtd + voltaram);

    payload.push({
      data, sabor_id: parseInt(row.dataset.saborId),
      estoque_inicial: ei, fez, furou, quantidade: qtd,
      voltaram: voltaram, estoque_final: estoqueFinalCalculado
    });
  });
  await api('/api/lancamentos', { method: 'POST', body: payload });
  toast('✅ Lançamento salvo com sucesso!');
}

async function abrirHistorico() {
  const datas = await api('/api/lancamentos/datas');
  const lista = $('historico-lista');
  lista.innerHTML = '';
  if (!datas.length) { lista.innerHTML = '<div class="empty-state"><span class="emoji">📭</span><p>Nenhum lançamento ainda.</p></div>'; }
  datas.forEach(d => {
    const item = document.createElement('div');
    item.className = 'historico-item';
    const [ano, mes, dia] = d.split('-');
    item.innerHTML = `<span class="historico-data">📅 ${dia}/${mes}/${ano}</span><span class="historico-info">Ver lançamento →</span>`;
    item.addEventListener('click', () => {
      $('lanc-data').value = d;
      renderizarTabelaLancamento(d);
      $('modal-historico').classList.remove('open');
    });
    lista.appendChild(item);
  });
  $('modal-historico').classList.add('open');
}

$('lanc-data').addEventListener('change', () => renderizarTabelaLancamento($('lanc-data').value));
$('btn-lanc-salvar').addEventListener('click', salvarLancamento);
$('btn-lanc-historico').addEventListener('click', abrirHistorico);
$('modal-hist-close').addEventListener('click', () => $('modal-historico').classList.remove('open'));

// ─── ESTOQUE ─────────────────────────────────
async function carregarEstoque() {
  const estoque = await api('/api/stats/estoque-atual');
  renderizarEstoque(estoque, 'all');

  document.querySelectorAll('.filtro-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderizarEstoque(estoque, btn.dataset.cat);
    });
  });
}

function renderizarEstoque(estoque, cat) {
  const grid = $('estoque-grid');
  grid.innerHTML = '';
  const filtrado = cat === 'all' ? estoque : estoque.filter(e => e.categoria === cat);

  filtrado.forEach(e => {
    const nivel = e.estoque_atual === 0 ? 'baixo' : e.estoque_atual <= 5 ? 'medio' : 'alto';
    const card = document.createElement('div');
    card.className = `estoque-card ${nivel}`;
    const dataStr = e.ultima_data ? (() => { const [a,m,d]=e.ultima_data.split('-'); return `${d}/${m}/${a}`; })() : 'Sem dados';
    card.innerHTML = `
      <button class="btn-editar-estoque" title="Ajustar estoque" onclick="abrirAjusteEstoque(${e.id},'${e.nome}',${e.estoque_atual})">✏️</button>
      <div class="estoque-nome">${e.nome}</div>
      <div class="estoque-qty ${nivel}">${e.estoque_atual}</div>
      <div class="estoque-label">em estoque</div>
      <div class="estoque-data">📅 ${dataStr}</div>
    `;
    grid.appendChild(card);
  });
}

$('btn-atualizar-estoque').addEventListener('click', carregarEstoque);

// ─── MODAL AJUSTE DE ESTOQUE ─────────────────
let ajusteSaborId = null;

function abrirAjusteEstoque(id, nome, qtdAtual) {
  ajusteSaborId = id;
  $('ajuste-sabor-info').innerHTML = `🍧 <strong>${nome}</strong><br><span style="font-size:0.85rem;color:var(--azul-mid)">Estoque atual: <strong>${qtdAtual}</strong> unidades</span>`;
  $('ajuste-quantidade').value = qtdAtual;
  $('ajuste-data').value = hoje();
  $('modal-ajuste-estoque').classList.add('open');
  setTimeout(() => $('ajuste-quantidade').select(), 100);
}

async function confirmarAjusteEstoque() {
  const nova_quantidade = parseInt($('ajuste-quantidade').value);
  const data = $('ajuste-data').value;
  if (isNaN(nova_quantidade) || nova_quantidade < 0) return toast('Quantidade inválida!', 'error');
  if (!data) return toast('Selecione a data!', 'error');

  const res = await api('/api/estoque/ajustar', {
    method: 'POST',
    body: { sabor_id: ajusteSaborId, nova_quantidade, data }
  });

  if (res.ok) {
    toast(`✅ Estoque ajustado para ${nova_quantidade} unidades!`);
    $('modal-ajuste-estoque').classList.remove('open');
    carregarEstoque();
  } else {
    toast('Erro ao ajustar estoque.', 'error');
  }
}

$('modal-ajuste-close').addEventListener('click', () => $('modal-ajuste-estoque').classList.remove('open'));
$('btn-confirmar-ajuste').addEventListener('click', confirmarAjusteEstoque);

// Enter no campo de quantidade confirma
$('ajuste-quantidade').addEventListener('keydown', e => { if (e.key === 'Enter') confirmarAjusteEstoque(); });

// ─── RELATÓRIOS ──────────────────────────────
function popularAnosSelect(selId) {
  const sel = $(selId);
  sel.innerHTML = '';
  const anoAtual = new Date().getFullYear();
  for (let a = anoAtual; a >= anoAtual - 3; a--) {
    const opt = document.createElement('option');
    opt.value = a; opt.textContent = a;
    if (a === anoAtual) opt.selected = true;
    sel.appendChild(opt);
  }
}

function inicializarMesAtual(selId) {
  $(selId).value = String(new Date().getMonth() + 1);
}

async function carregarRelatorios() {
  popularAnosSelect('rel-ano');
  inicializarMesAtual('rel-mes');
  await gerarRelatorio();
}

async function gerarRelatorio() {
  const mes = $('rel-mes').value;
  const ano = $('rel-ano').value;
  const [dados, evolucao] = await Promise.all([
    api(`/api/stats/resumo-mes?mes=${mes}&ano=${ano}`),
    api('/api/stats/evolucao-mensal')
  ]);

  // Cards totais
  const totais = dados.totais;
  $('rel-totais').innerHTML = `
    <div class="card card-green"><div class="card-icon">🍧</div><div class="card-info"><div class="card-value">${fmtNum(totais.vendidos)}</div><div class="card-label">Total Vendidos</div></div></div>
    <div class="card card-yellow"><div class="card-icon">💵</div><div class="card-info"><div class="card-value">${fmt(totais.receita)}</div><div class="card-label">Receita Total</div></div></div>
    <div class="card card-blue"><div class="card-icon">🏭</div><div class="card-info"><div class="card-value">${fmtNum(totais.produzidos)}</div><div class="card-label">Produzidos</div></div></div>
    <div class="card card-red"><div class="card-icon">💥</div><div class="card-info"><div class="card-value">${fmtNum(totais.perdas)}</div><div class="card-label">Perdas</div></div></div>
  `;

  // Gráfico dias
  destroyChart('chart-rel-dias');
  if (dados.dias.length) {
    state.charts['chart-rel-dias'] = new Chart($('chart-rel-dias'), {
      type: 'bar',
      data: {
        labels: dados.dias.map(d => d.data.slice(8) + '/' + d.data.slice(5,7)),
        datasets: [{ label: 'Receita R$', data: dados.dias.map(d => Math.max(0,d.receita)), backgroundColor: '#5BB894', borderRadius: 5 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 32 } },
        plugins: {
          legend: { display: false },
          datalabels: {
            anchor: 'end', align: 'top',
            formatter: (v) => v > 0 ? 'R$' + Number(v).toFixed(0) : ''
          }
        },
        scales: { y: { beginAtZero: true, ticks: { callback: v => 'R$' + v } } }
      }
    });
  }

  // Gráfico categorias
  const catData = { fruta: 0, doce_especial: 0, zero_lactose: 0 };
  (dados.porSabor || []).forEach(s => { catData[s.categoria] = (catData[s.categoria] || 0) + (Number(s.vendidos) || 0); });
  destroyChart('chart-rel-categoria');
  state.charts['chart-rel-categoria'] = new Chart($('chart-rel-categoria'), {
    type: 'doughnut',
    data: {
      labels: ['Frutas', 'Doces Especiais', 'Zero Lactose'],
      datasets: [{ data: [catData.fruta, catData.doce_especial, catData.zero_lactose], backgroundColor: ['#5BB894','#F5C518','#2DB8C8'], borderWidth: 0 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        datalabels: {
          anchor: 'center', align: 'center',
          color: '#fff', font: { weight: 'bold', size: 13 },
          formatter: (value, ctx) => {
            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
            if (!total || !value) return '';
            return Math.round(value / total * 100) + '%\n(' + value + ' un.)';
          }
        }
      }
    }
  });

  // Gráfico ranking
  const top15 = (dados.porSabor || []).filter(s => s.vendidos > 0).slice(0, 15);
  destroyChart('chart-rel-ranking');
  if (top15.length) {
    state.charts['chart-rel-ranking'] = new Chart($('chart-rel-ranking'), {
      type: 'bar',
      data: {
        labels: top15.map(s => s.nome),
        datasets: [{ label: 'Vendidos', data: top15.map(s => s.vendidos),
          backgroundColor: top15.map(s => s.categoria==='fruta'?'#5BB894':s.categoria==='doce_especial'?'#F5C518':'#2DB8C8'), borderRadius: 6 }]
      },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, datalabels: { align: 'right', anchor: 'end' } }, scales: { x: { beginAtZero: true } } }
    });
  }

  // Gráfico evolução mensal
  destroyChart('chart-evolucao');
  if (evolucao.length) {
    const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    state.charts['chart-evolucao'] = new Chart($('chart-evolucao'), {
      type: 'line',
      data: {
        labels: evolucao.map(e => { const [a,m] = e.mes.split('-'); return meses[parseInt(m)-1]+'/'+a.slice(2); }),
        datasets: [
          { label: 'Receita R$', data: evolucao.map(e => Math.max(0, parseFloat(e.receita || 0))), borderColor:'#5BB894', backgroundColor:'rgba(91,184,148,0.1)', fill:true, tension:0.4, yAxisID:'y', pointRadius:5, pointHoverRadius:7 },
          { label: 'Vendidos', data: evolucao.map(e => Math.max(0, Number(e.vendidos) || 0)), borderColor:'#1B3A6B', backgroundColor:'rgba(27,58,107,0.1)', fill:false, tension:0.4, yAxisID:'y1', pointRadius:5, pointHoverRadius:7 }
        ]
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins: {
          datalabels: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ctx.dataset.yAxisID === 'y'
                ? ' Receita: ' + fmt(ctx.parsed.y)
                : ' Vendidos: ' + ctx.parsed.y
            }
          }
        },
        scales: {
          y: { beginAtZero:true, position:'left', ticks: { callback: v => 'R$' + Number(v).toFixed(0) } },
          y1: { beginAtZero:true, position:'right', grid:{ drawOnChartArea:false }, ticks: { stepSize:1 } }
        }
      }
    });
  }

  // Tabela detalhe
  const tbody = $('rel-tbody');
  tbody.innerHTML = '';
  (dados.porSabor || []).forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${s.nome}</td><td><span class="sabor-categoria cat-${s.categoria}">${catLabel(s.categoria)}</span></td><td class="fw-bold">${fmtNum(s.vendidos)}</td><td class="fw-bold text-green">${fmt(s.receita)}</td>`;
    tbody.appendChild(tr);
  });
}

$('btn-gerar-rel').addEventListener('click', gerarRelatorio);

// ─── GASTOS DE PRODUÇÃO ──────────────────────
async function carregarGastos() {
  popularAnosSelect('gastos-ano');
  inicializarMesAtual('gastos-mes');
  // Popular select de sabores no modal
  const sabores = state.sabores.length ? state.sabores : await api('/api/sabores');
  const sel = $('gasto-sabor');
  sel.innerHTML = '<option value="">— Sem sabor específico —</option>';
  sabores.forEach(s => { sel.innerHTML += `<option value="${s.id}">${s.nome}</option>`; });
  $('btn-tab-historico').click();
  await renderizarGastos();
}

async function renderizarGastos() {
  const mes = $('gastos-mes').value;
  const ano = $('gastos-ano').value;
  const gastos = await api(`/api/gastos?mes=${mes}&ano=${ano}`);
  const total = gastos.reduce((a, g) => a + g.valor, 0);
  const receita = gastos.reduce((a, g) => a + (g.geladinhos_produzidos || 0) * (g.sabor_preco || 0), 0);
  const lucro = receita - total;
  const lucroClass = lucro >= 0 ? 'card-green' : 'card-red';
  const lucroIcon = lucro >= 0 ? '📈' : '📉';

  $('gastos-resumo').innerHTML = `
    <div class="card card-red"><div class="card-icon">💸</div><div class="card-info"><div class="card-value">${fmt(total)}</div><div class="card-label">Total de Gastos</div></div></div>
    <div class="card card-blue"><div class="card-icon">📋</div><div class="card-info"><div class="card-value">${gastos.length}</div><div class="card-label">Registros</div></div></div>
    <div class="card ${lucroClass}"><div class="card-icon">${lucroIcon}</div><div class="card-info"><div class="card-value">${fmt(lucro)}</div><div class="card-label">Total de Lucro</div></div></div>
  `;

  const tbody = $('gastos-tbody');
  tbody.innerHTML = '';
  if (!gastos.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><span class="emoji">📭</span><p>Nenhum gasto registrado neste mês.</p></td></tr>';
    return;
  }
  gastos.forEach(g => {
    const [a,m,d] = g.data.split('-');
    const qtd = g.geladinhos_produzidos || 0;
    const bruto = qtd * (g.sabor_preco || 0);
    const lucroLinha = bruto - g.valor;
    const lucroColor = lucroLinha >= 0 ? 'text-green' : 'text-red';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${d}/${m}/${a}</td>
      <td>${g.sabor_nome || '—'}</td>
      <td>${g.descricao || '—'}</td>
      <td>${qtd}</td>
      <td class="fw-bold text-red">${fmt(g.valor)}</td>
      <td class="fw-bold">${bruto > 0 ? fmt(bruto) : '—'}</td>
      <td class="fw-bold ${lucroColor}">${bruto > 0 ? fmt(lucroLinha) : '—'}</td>
      <td><button class="btn btn-danger" onclick="deletarGasto(${g.id})">🗑</button></td>
    `;
    tbody.appendChild(tr);
  });
}

async function deletarGasto(id) {
  if (!confirm('Excluir este gasto?')) return;
  await api(`/api/gastos/${id}`, { method: 'DELETE' });
  toast('Gasto excluído!', 'info');
  renderizarGastos();
}

async function salvarGasto() {
  const data = $('gasto-data').value;
  const sabor_id = $('gasto-sabor').value || null;
  const descricao = $('gasto-desc').value;
  const valor = parseFloat($('gasto-valor').value);
  const geladinhos_produzidos = parseInt($('gasto-qtd').value) || 0;
  if (!data || !valor) return toast('Preencha data e valor!', 'error');
  await api('/api/gastos', { method: 'POST', body: { data, sabor_id, descricao, valor, geladinhos_produzidos } });
  $('modal-gasto').classList.remove('open');
  toast('✅ Gasto registrado!');
  renderizarGastos();
}

$('btn-novo-gasto').addEventListener('click', () => {
  $('gasto-data').value = hoje();
  $('gasto-valor').value = '';
  $('gasto-desc').value = '';
  $('gasto-qtd').value = 0;
  $('modal-gasto').classList.add('open');
});
$('modal-gasto-close').addEventListener('click', () => $('modal-gasto').classList.remove('open'));
$('btn-salvar-gasto').addEventListener('click', salvarGasto);
$('gastos-mes').addEventListener('change', renderizarGastos);
$('gastos-ano').addEventListener('change', renderizarGastos);

// ─── ABA: INGREDIENTES E RECEITAS ────────────────

// Tabs controle de gastos
['ingredientes', 'receitas', 'historico'].forEach(t => {
  $(`btn-tab-${t}`).addEventListener('click', () => {
    ['ingredientes', 'receitas', 'historico'].forEach(x => {
      $(`gastos-tab-${x}`).style.display = 'none';
      $(`btn-tab-${x}`).classList.replace('btn-primary', 'btn-outline');
    });
    $(`gastos-tab-${t}`).style.display = 'block';
    $(`btn-tab-${t}`).classList.replace('btn-outline', 'btn-primary');
    if (t === 'ingredientes') renderizarIngredientes();
    if (t === 'receitas') carregarSaboresReceita();
  });
});

let editandoIngredienteId = null;

async function renderizarIngredientes() {
  state.ingredientes = await api('/api/ingredientes');
  const tbody = $('ingredientes-tbody');
  tbody.innerHTML = '';
  if (!state.ingredientes.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><span class="emoji">🍎</span><p>Nenhum ingrediente cadastrado.</p></td></tr>';
    return;
  }
  state.ingredientes.forEach(i => {
    const custoUnit = i.preco_unitario / i.volume;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i.nome}</td>
      <td class="text-red">${fmt(i.preco_unitario)}</td>
      <td>${i.volume} ${i.unidade}</td>
      <td>${i.unidade}</td>
      <td class="text-blue">R$ ${custoUnit.toFixed(4)} / ${i.unidade}</td>
      <td>
        <button class="btn btn-primary" onclick="editarIngrediente(${i.id})">✏️</button>
        <button class="btn btn-danger" onclick="deletarIngrediente(${i.id})">🗑</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function editarIngrediente(id) {
  const i = state.ingredientes.find(x => x.id === id);
  editandoIngredienteId = id;
  $('ingrediente-nome').value = i.nome;
  $('ingrediente-preco').value = i.preco_unitario;
  $('ingrediente-volume').value = i.volume;
  $('ingrediente-unidade').value = i.unidade;
  $('modal-ingrediente').classList.add('open');
}

async function deletarIngrediente(id) {
  if (!confirm('Excluir ingrediente? Ele será removido das receitas.')) return;
  await api(`/api/ingredientes/${id}`, { method: 'DELETE' });
  toast('Ingrediente excluído!', 'info');
  renderizarIngredientes();
  renderizarReceitaAtual();
}

$('btn-novo-ingrediente').addEventListener('click', () => {
  editandoIngredienteId = null;
  $('ingrediente-nome').value = '';
  $('ingrediente-preco').value = '';
  $('ingrediente-volume').value = '';
  $('ingrediente-unidade').value = 'g';
  $('modal-ingrediente').classList.add('open');
});
$('modal-ingrediente-close').addEventListener('click', () => $('modal-ingrediente').classList.remove('open'));

$('btn-salvar-ingrediente').addEventListener('click', async () => {
  const obj = {
    nome: $('ingrediente-nome').value,
    preco_unitario: parseFloat($('ingrediente-preco').value),
    volume: parseFloat($('ingrediente-volume').value),
    unidade: $('ingrediente-unidade').value
  };
  if (!obj.nome || !obj.preco_unitario || !obj.volume) return toast('Preencha os campos', 'error');
  
  if (editandoIngredienteId) {
    await api(`/api/ingredientes/${editandoIngredienteId}`, { method: 'PUT', body: obj });
  } else {
    await api('/api/ingredientes', { method: 'POST', body: obj });
  }
  $('modal-ingrediente').classList.remove('open');
  toast('✅ Ingrediente salvo!');
  renderizarIngredientes();
  if ($('gastos-tab-receitas').style.display !== 'none') renderizarReceitaAtual();
});

// ─── RECEITAS ─────────────────────────────────
async function carregarSaboresReceita() {
  const sabores = state.sabores.length ? state.sabores : await api('/api/sabores');
  state.sabores = sabores;
  const sel = $('receita-sabor-select');
  sel.innerHTML = '<option value="">— Selecione um Sabor —</option>';
  sabores.forEach(s => { sel.innerHTML += `<option value="${s.id}">${s.nome}</option>`; });
}

$('receita-sabor-select').addEventListener('change', renderizarReceitaAtual);

async function renderizarReceitaAtual() {
  const id = $('receita-sabor-select').value;
  if (!id) {
    $('receita-tbody').innerHTML = '';
    return;
  }
  
  const rec = await api(`/api/receitas/${id}`);
  const rendimento = rec.rendimento || 20;
  $('receita-rendimento').value = rendimento;
  
  const tbody = $('receita-tbody');
  tbody.innerHTML = '';
  if (!rec.ingredientes.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><span class="emoji">📝</span><p>Nenhum ingrediente na receita.</p></td></tr>';
  }
  
  let custoTotal = 0;
  state.receitaAtualIngr = rec.ingredientes;
  
  rec.ingredientes.forEach((i, idx) => {
    const custo = (i.preco_unitario / i.volume) * i.quantidade;
    custoTotal += custo;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i.nome}</td>
      <td>${i.quantidade}</td>
      <td>${i.unidade}</td>
      <td class="text-red">${fmt(custo)}</td>
      <td style="display:flex; gap:0.5rem; justify-content:center;">
        <button class="btn btn-primary btn-sm" onclick="editarIngredienteReceita(${idx})">✏️</button>
        <button class="btn btn-danger btn-sm" onclick="removerIngredienteReceita(${idx})">🗑</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  
  $('receita-custo-total').textContent = fmt(custoTotal);
  $('receita-custo-unit').textContent = fmt(custoTotal / rendimento);
  
  state.receitaCustoTotal = custoTotal;
  state.receitaRendimento = rendimento;
}

$('btn-salvar-rendimento').addEventListener('click', async () => {
  const id = $('receita-sabor-select').value;
  if(!id) return;
  const rnd = parseInt($('receita-rendimento').value);
  await api(`/api/receitas/${id}`, { method: 'POST', body: { rendimento: rnd, ingredientes: state.receitaAtualIngr } });
  toast('✅ Rendimento salvo!');
  renderizarReceitaAtual();
});

$('btn-add-receita-ingr').addEventListener('click', async () => {
  const id = $('receita-sabor-select').value;
  if(!id) return toast('Selecione um sabor primeiro', 'error');
  state.ingredientes = await api('/api/ingredientes');
  const sel = $('receita-ingrediente-select');
  sel.innerHTML = '';
  state.ingredientes.forEach(i => { sel.innerHTML += `<option value="${i.id}">${i.nome}</option>`; });
  $('receita-ingr-qtd').value = '';
  $('receita-ingr-unidade').textContent = state.ingredientes[0] ? state.ingredientes[0].unidade : '';
  $('modal-receita-ingr').classList.add('open');
});

$('receita-ingrediente-select').addEventListener('change', (e) => {
  const ing = state.ingredientes.find(i => i.id == e.target.value);
  $('receita-ingr-unidade').textContent = ing ? ing.unidade : '';
});

$('modal-receita-ingr-close').addEventListener('click', () => $('modal-receita-ingr').classList.remove('open'));

$('btn-salvar-receita-ingr').addEventListener('click', async () => {
  const id = $('receita-sabor-select').value;
  const ing_id = $('receita-ingrediente-select').value;
  const qtd = parseFloat($('receita-ingr-qtd').value);
  if(!ing_id || !qtd) return toast('Preencha a quantidade', 'error');
  
  const ing = state.receitaAtualIngr.find(i => i.ingrediente_id == ing_id);
  if(ing) ing.quantidade += qtd;
  else state.receitaAtualIngr.push({ ingrediente_id: ing_id, quantidade: qtd });
  
  const rnd = parseInt($('receita-rendimento').value) || 20;
  await api(`/api/receitas/${id}`, { method: 'POST', body: { rendimento: rnd, ingredientes: state.receitaAtualIngr } });
  
  $('modal-receita-ingr').classList.remove('open');
  toast('✅ Ingrediente adicionado!');
  renderizarReceitaAtual();
});

async function editarIngredienteReceita(idx) {
  const item = state.receitaAtualIngr[idx];
  const novaQtd = prompt(`Nova quantidade utilizada de ${item.nome} (${item.unidade}):`, item.quantidade);
  if (novaQtd === null) return;
  const qtd = parseFloat(novaQtd.replace(',', '.'));
  if (isNaN(qtd) || qtd <= 0) return toast('Quantidade inválida!', 'error');
  
  state.receitaAtualIngr[idx].quantidade = qtd;
  const id = $('receita-sabor-select').value;
  const rnd = parseInt($('receita-rendimento').value) || 20;
  
  try {
    await api(`/api/receitas/${id}`, { method: 'POST', body: { rendimento: rnd, ingredientes: state.receitaAtualIngr } });
    toast('✅ Quantidade atualizada!');
    renderizarReceitaAtual();
  } catch (err) {
    toast('Erro ao atualizar', 'error');
  }
}

async function removerIngredienteReceita(idx) {
  if (!confirm('Remover este ingrediente da receita?')) return;
  const id = $('receita-sabor-select').value;
  state.receitaAtualIngr.splice(idx, 1);
  const rnd = parseInt($('receita-rendimento').value) || 20;
  
  try {
    await api(`/api/receitas/${id}`, { method: 'POST', body: { rendimento: rnd, ingredientes: state.receitaAtualIngr } });
    toast('🗑 Ingrediente removido!');
    renderizarReceitaAtual();
  } catch (err) {
    toast('Erro ao remover', 'error');
  }
}

// ─── PRODUÇÃO (Gerar Gasto) ───────────────────
$('btn-gerar-gasto-receita').addEventListener('click', () => {
  const sabor_id = $('receita-sabor-select').value;
  if(!sabor_id) return toast('Selecione um sabor', 'error');
  if(!state.receitaCustoTotal) return toast('A receita não tem custo (adicione ingredientes)', 'warning');
  
  $('producao-custo-receita').textContent = fmt(state.receitaCustoTotal);
  $('producao-rendimento').textContent = state.receitaRendimento;
  $('producao-data').value = hoje();
  $('producao-multiplicador').value = '1';
  atualizarCalculoProducao();
  $('modal-producao').classList.add('open');
});

$('modal-producao-close').addEventListener('click', () => $('modal-producao').classList.remove('open'));

function atualizarCalculoProducao() {
  const mult = parseFloat($('producao-multiplicador').value);
  const qtd = Math.round(state.receitaRendimento * mult);
  const custo = state.receitaCustoTotal * mult;
  
  const sabor_id = $('receita-sabor-select').value;
  const sabor = state.sabores.find(s => s.id == sabor_id);
  const preco = sabor ? sabor.preco : 0;
  
  const bruto = qtd * preco;
  const lucro = bruto - custo;
  
  $('producao-calc-gasto').textContent = fmt(custo);
  $('producao-calc-qtd').textContent = qtd;
  $('producao-calc-bruto').textContent = fmt(bruto);
  $('producao-calc-lucro').textContent = fmt(lucro);
  
  if (lucro < 0) {
    $('producao-calc-lucro').style.color = '#e63946'; // Red if loss
  } else {
    $('producao-calc-lucro').style.color = '#2f855a'; // Green if profit
  }
}

$('producao-multiplicador').addEventListener('change', atualizarCalculoProducao);

$('btn-salvar-producao').addEventListener('click', async () => {
  const mult = parseFloat($('producao-multiplicador').value);
  const sabor_id = $('receita-sabor-select').value;
  const data = $('producao-data').value;
  if(!data) return toast('Selecione a data', 'error');
  
  const valor = state.receitaCustoTotal * mult;
  const qtd = Math.round(state.receitaRendimento * mult);
  const sabor_nome = $('receita-sabor-select').options[$('receita-sabor-select').selectedIndex].text;
  
  await api('/api/producao', {
    method: 'POST',
    body: { data, sabor_id, descricao: `Produção: ${sabor_nome} (${mult}x)`, valor, geladinhos_produzidos: qtd }
  });
  
  $('modal-producao').classList.remove('open');
  toast('✅ Gasto de produção registrado!', 'success');
  
  $('btn-tab-historico').click();
  renderizarGastos();
});

// ─── SABORES ─────────────────────────────────
let editandoSaborId = null;

async function carregarSabores() {
  const sabores = await api('/api/sabores');
  state.sabores = sabores;
  const tbody = $('sabores-tbody');
  tbody.innerHTML = '';
  sabores.forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="fw-bold">${s.nome}</td>
      <td><span class="sabor-categoria cat-${s.categoria}">${catLabel(s.categoria)}</span></td>
      <td>${fmt(s.preco)}</td>
      <td><span class="badge ${s.ativo ? 'badge-on' : 'badge-off'}">${s.ativo ? '✅ Ativo' : '❌ Inativo'}</span></td>
      <td>
        <button class="btn btn-edit" onclick="editarSabor(${s.id},'${s.nome.replace(/'/g,"\\'")}','${s.categoria}',${s.preco},${s.ativo})">✏️ Editar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function editarSabor(id, nome, cat, preco, ativo) {
  editandoSaborId = id;
  $('modal-sabor-titulo').textContent = '✏️ Editar Sabor';
  $('sabor-nome').value = nome;
  $('sabor-cat').value = cat;
  $('sabor-preco').value = preco;
  $('sabor-ativo').value = ativo;
  $('modal-sabor').classList.add('open');
}

async function salvarSabor() {
  const nome = $('sabor-nome').value.trim();
  const categoria = $('sabor-cat').value;
  const preco = parseFloat($('sabor-preco').value);
  const ativo = parseInt($('sabor-ativo').value);
  if (!nome || !preco) return toast('Preencha nome e preço!', 'error');

  if (editandoSaborId) {
    await api(`/api/sabores/${editandoSaborId}`, { method: 'PUT', body: { nome, categoria, preco, ativo } });
    toast('✅ Sabor atualizado!');
  } else {
    await api('/api/sabores', { method: 'POST', body: { nome, categoria, preco } });
    toast('✅ Sabor criado!');
  }
  $('modal-sabor').classList.remove('open');
  state.sabores = [];
  carregarSabores();
}

$('btn-novo-sabor').addEventListener('click', () => {
  editandoSaborId = null;
  $('modal-sabor-titulo').textContent = '🍧 Novo Sabor';
  $('sabor-nome').value = '';
  $('sabor-cat').value = 'fruta';
  $('sabor-preco').value = '6.00';
  $('sabor-ativo').value = '1';
  $('modal-sabor').classList.add('open');
});
$('modal-sabor-close').addEventListener('click', () => $('modal-sabor').classList.remove('open'));
$('btn-salvar-sabor').addEventListener('click', salvarSabor);

// Fechar modais clicando fora
document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
});

// ─── AUTH ─────────────────────────────────────
async function fazerLogin() {
  const nome = $('login-nome').value.trim();
  const senha = $('login-senha').value;
  const erroEl = $('login-erro');
  erroEl.style.display = 'none';
  if (!nome || !senha) {
    erroEl.textContent = 'Preencha usuário e senha.';
    erroEl.style.display = 'block';
    return;
  }
  const btn = $('btn-login');
  btn.textContent = 'Entrando...';
  btn.disabled = true;
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, senha })
    });
    const data = await res.json();
    if (!res.ok) {
      erroEl.textContent = data.erro || 'Erro ao entrar.';
      erroEl.style.display = 'block';
      return;
    }
    localStorage.setItem('gigi_token', data.token);
    localStorage.setItem('gigi_usuario', data.nome);
    $('sidebar-username').textContent = data.nome;
    if (data.deve_trocar_senha) {
      $('modal-alterar-senha').classList.add('open');
    } else {
      $('login-overlay').style.display = 'none';
      await iniciarApp();
    }
  } catch {
    erroEl.textContent = 'Erro de conexão. Tente novamente.';
    erroEl.style.display = 'block';
  } finally {
    btn.textContent = 'Entrar';
    btn.disabled = false;
  }
}

async function confirmarNovaSenha() {
  const nova = $('nova-senha').value;
  const confirmar = $('confirmar-senha').value;
  const erroEl = $('senha-erro');
  erroEl.style.display = 'none';
  if (nova.length < 6) {
    erroEl.textContent = 'Senha deve ter no mínimo 6 caracteres.';
    erroEl.style.display = 'block';
    return;
  }
  if (nova !== confirmar) {
    erroEl.textContent = 'As senhas não coincidem.';
    erroEl.style.display = 'block';
    return;
  }
  const btn = $('btn-confirmar-senha');
  btn.textContent = 'Salvando...';
  btn.disabled = true;
  try {
    const res = await api('/api/alterar-senha', { method: 'POST', body: { nova_senha: nova } });
    if (res?.ok) {
      $('modal-alterar-senha').classList.remove('open');
      $('login-overlay').style.display = 'none';
      await iniciarApp();
    }
  } catch {
    erroEl.textContent = 'Erro ao salvar senha.';
    erroEl.style.display = 'block';
  } finally {
    btn.textContent = '💾 Salvar e Entrar';
    btn.disabled = false;
  }
}

async function fazerLogout() {
  const token = localStorage.getItem('gigi_token');
  if (token) {
    fetch('/api/logout', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } }).catch(() => {});
  }
  localStorage.removeItem('gigi_token');
  localStorage.removeItem('gigi_usuario');
  Object.keys(state.charts).forEach(k => { state.charts[k]?.destroy(); });
  state.charts = {};
  state.sabores = [];
  $('login-nome').value = '';
  $('login-senha').value = '';
  $('login-erro').style.display = 'none';
  $('sidebar-username').textContent = '';
  $('login-overlay').style.display = 'flex';
}

$('btn-login').addEventListener('click', fazerLogin);
$('login-nome').addEventListener('keydown', e => { if (e.key === 'Enter') $('login-senha').focus(); });
$('login-senha').addEventListener('keydown', e => { if (e.key === 'Enter') fazerLogin(); });
$('btn-confirmar-senha').addEventListener('click', confirmarNovaSenha);
$('confirmar-senha').addEventListener('keydown', e => { if (e.key === 'Enter') confirmarNovaSenha(); });
$('btn-logout').addEventListener('click', fazerLogout);

// ─── PEDIDO CLIENTE ───────────────────────────
const WA_NUMS = ['5563999667047', '5563992657531'];
const WA_NOMES = ['Jailson', 'Gigi'];
let pedidoCarrinho = {};

async function abrirModalPedido() {
  pedidoCarrinho = {};
  $('pedido-nome').value = '';
  $('pedido-carrinho').style.display = 'none';
  const sabores = await fetch('/api/sabores-publico').then(r => r.json());
  const lista = $('pedido-sabores-lista');
  lista.innerHTML = '';
  sabores.forEach(s => {
    pedidoCarrinho[s.id] = { nome: s.nome, preco: s.preco, qtd: 0 };
    const div = document.createElement('div');
    div.className = 'sabor-item';
    div.innerHTML = `
      <div class="sabor-item-info">
        <span class="sabor-item-nome">${s.nome}</span>
        <span class="sabor-item-preco">${fmt(s.preco)} cada</span>
      </div>
      <div class="sabor-item-ctrl">
        <button onclick="pedidoAjustar(${s.id}, -1)">−</button>
        <span class="qtd-display" id="pedido-qtd-${s.id}">0</span>
        <button onclick="pedidoAjustar(${s.id}, +1)">+</button>
      </div>
    `;
    lista.appendChild(div);
  });
  $('modal-pedido').classList.add('open');
}

function pedidoAjustar(id, delta) {
  const item = pedidoCarrinho[id];
  item.qtd = Math.max(0, item.qtd + delta);
  $(`pedido-qtd-${id}`).textContent = item.qtd;
  atualizarResumoPedido();
}

function atualizarResumoPedido() {
  const itens = Object.values(pedidoCarrinho).filter(i => i.qtd > 0);
  const total = itens.reduce((a, i) => a + i.qtd * i.preco, 0);
  const carrinho = $('pedido-carrinho');
  if (!itens.length) { carrinho.style.display = 'none'; return; }
  carrinho.style.display = 'block';
  $('pedido-resumo-itens').innerHTML = itens.map(i =>
    `<div style="display:flex;justify-content:space-between;padding:0.2rem 0;">
      <span>${i.nome} × ${i.qtd}</span>
      <span>${fmt(i.qtd * i.preco)}</span>
    </div>`
  ).join('');
  $('pedido-total').textContent = fmt(total);
}

function montarMensagemPedido() {
  const nome = $('pedido-nome').value.trim() || 'Cliente';
  const itens = Object.values(pedidoCarrinho).filter(i => i.qtd > 0);
  if (!itens.length) { toast('Adicione ao menos um sabor!', 'error'); return null; }
  const total = itens.reduce((a, i) => a + i.qtd * i.preco, 0);
  const linhas = itens.map(i => `- ${i.nome} x${i.qtd} = ${fmt(i.qtd * i.preco)}`).join('\n');
  return `Ola! Gostaria de fazer um pedido\n\nNome: *${nome}*\n\n${linhas}\n\n*Total: ${fmt(total)}*`;
}

function enviarPedidoWhatsApp(idx) {
  const msg = montarMensagemPedido();
  if (!msg) return;
  const url = `https://wa.me/${WA_NUMS[idx]}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

$('btn-politica-privacidade').addEventListener('click', e => { e.preventDefault(); $('modal-politica').classList.add('open'); });
$('modal-politica-close').addEventListener('click', () => $('modal-politica').classList.remove('open'));

$('btn-abrir-pedido').addEventListener('click', abrirModalPedido);
$('modal-pedido-close').addEventListener('click', () => $('modal-pedido').classList.remove('open'));
$('btn-whatsapp-1').addEventListener('click', () => enviarPedidoWhatsApp(0));
$('btn-whatsapp-2').addEventListener('click', () => enviarPedidoWhatsApp(1));

// ─── INICIALIZAÇÃO ────────────────────────────
async function iniciarApp() {
  state.sabores = await api('/api/sabores');
  carregarDashboard();
}

(async function init() {
  const token = localStorage.getItem('gigi_token');
  if (!token) { $('login-overlay').style.display = 'flex'; return; }
  // Valida token existente
  const res = await fetch('/api/sabores', { headers: { 'Authorization': `Bearer ${token}` } });
  if (res.status === 401) {
    localStorage.removeItem('gigi_token');
    localStorage.removeItem('gigi_usuario');
    $('login-overlay').style.display = 'flex';
    return;
  }
  state.sabores = await res.json();
  $('sidebar-username').textContent = localStorage.getItem('gigi_usuario') || '';
  $('login-overlay').style.display = 'none';
  carregarDashboard();
})();
