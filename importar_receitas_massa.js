const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('gigi_estoque.db');

const receitas = [
  {
    sabor: 'Morango',
    rendimento: 20,
    ingredientes: [
      { nome: 'Açúcar', qtd: 300 },
      { nome: 'Açúcar geleia', qtd: 250 },
      { nome: 'Creme de leite', qtd: 1 },
      { nome: 'Embalagem', qtd: 20 },
      { nome: 'Etiqueta', qtd: 20 },
      { nome: 'Leite condensado', qtd: 1 },
      { nome: 'Leite em pó', qtd: 60 },
      { nome: 'Leite integral', qtd: 1.5 },
      { nome: 'Liga neutra', qtd: 20 },
      { nome: 'Morango', qtd: 350 },
      { nome: 'Suco', qtd: 3 }
    ]
  },
  {
    sabor: 'Amendoim',
    rendimento: 20,
    ingredientes: [
      { nome: 'Açúcar', qtd: 450 },
      { nome: 'Amendoim', qtd: 200 },
      { nome: 'Creme de leite', qtd: 1 },
      { nome: 'Embalagem', qtd: 20 },
      { nome: 'Etiqueta', qtd: 20 },
      { nome: 'Leite condensado', qtd: 1 },
      { nome: 'Leite em pó', qtd: 60 },
      { nome: 'Leite integral', qtd: 1.5 },
      { nome: 'Liga neutra', qtd: 20 }
    ]
  },
  {
    sabor: 'Prestígio',
    rendimento: 20,
    ingredientes: [
      { nome: 'Açúcar', qtd: 470 },
      { nome: 'Chocolate/fracionado', qtd: 100 },
      { nome: 'Coco Ralado seco', qtd: 100 },
      { nome: 'Coco Ralado fresco', qtd: 100 },
      { nome: 'Creme de leite', qtd: 1 },
      { nome: 'Embalagem', qtd: 20 },
      { nome: 'Etiqueta', qtd: 20 },
      { nome: 'Leite condensado', qtd: 1 },
      { nome: 'Leite de coco', qtd: 1 },
      { nome: 'Leite em pó', qtd: 60 },
      { nome: 'Leite integral', qtd: 1.5 },
      { nome: 'Liga neutra', qtd: 20 }
    ]
  },
  {
    sabor: 'Brigadeiro',
    rendimento: 20,
    ingredientes: [
      { nome: 'Açúcar', qtd: 250 },
      { nome: 'Cobertura Chocolate', qtd: 200 },
      { nome: 'Chocolate em pó', qtd: 180 },
      { nome: 'Creme de leite', qtd: 1 },
      { nome: 'Embalagem', qtd: 20 },
      { nome: 'Etiqueta', qtd: 20 },
      { nome: 'Granulado', qtd: 6 },
      { nome: 'Leite condensado', qtd: 1 },
      { nome: 'Leite em pó', qtd: 60 },
      { nome: 'Leite integral', qtd: 1.5 },
      { nome: 'Liga neutra', qtd: 20 },
      { nome: 'Nescau', qtd: 50 }
    ]
  },
  {
    sabor: 'Maracujá',
    rendimento: 20,
    ingredientes: [
      { nome: 'Açúcar', qtd: 200 },
      { nome: 'Açúcar geleia', qtd: 250 },
      { nome: 'Creme de leite', qtd: 1 },
      { nome: 'Embalagem', qtd: 20 },
      { nome: 'Etiqueta', qtd: 20 },
      { nome: 'Leite condensado', qtd: 1 },
      { nome: 'Leite em pó', qtd: 60 },
      { nome: 'Leite integral', qtd: 1 },
      { nome: 'Liga neutra', qtd: 20 },
      { nome: 'Maracujá ', qtd: 100 },
      { nome: 'Suco', qtd: 3 }
    ]
  },
  {
    sabor: 'Maracujá com Nutella',
    rendimento: 20,
    ingredientes: [
      { nome: 'Açúcar', qtd: 200 },
      { nome: 'Creme de leite', qtd: 1 },
      { nome: 'Embalagem', qtd: 20 },
      { nome: 'Etiqueta', qtd: 20 },
      { nome: 'Leite condensado', qtd: 1 },
      { nome: 'Leite em pó', qtd: 60 },
      { nome: 'Leite integral', qtd: 1 },
      { nome: 'Liga neutra', qtd: 20 },
      { nome: 'Nutella', qtd: 200 },
      { nome: 'Suco', qtd: 3 }
    ]
  },
  {
    sabor: 'Uva',
    rendimento: 20,
    ingredientes: [
      { nome: 'Açúcar', qtd: 200 },
      { nome: 'Açúcar geleia', qtd: 120 },
      { nome: 'Calda', qtd: 15 },
      { nome: 'Creme de leite', qtd: 1 },
      { nome: 'Embalagem', qtd: 20 },
      { nome: 'Etiqueta', qtd: 20 },
      { nome: 'Leite condensado', qtd: 1 },
      { nome: 'Leite em pó', qtd: 60 },
      { nome: 'Leite integral', qtd: 1.5 },
      { nome: 'Liga neutra', qtd: 20 },
      { nome: 'Suco', qtd: 3 },
      { nome: 'Uva', qtd: 250 }
    ]
  },
  {
    sabor: 'Buriti',
    rendimento: 25,
    ingredientes: [
      { nome: 'Açúcar', qtd: 400 },
      { nome: 'Buriti', qtd: 400 },
      { nome: 'Creme de leite', qtd: 1 },
      { nome: 'Embalagem', qtd: 25 },
      { nome: 'Etiqueta', qtd: 25 },
      { nome: 'Leite condensado triângulo ', qtd: 1 },
      { nome: 'Leite integral', qtd: 1.5 },
      { nome: 'Liga neutra', qtd: 20 }
    ]
  },
  {
    sabor: 'Morango com Nutella',
    rendimento: 20,
    ingredientes: [
      { nome: 'Açúcar', qtd: 200 },
      { nome: 'Creme de leite', qtd: 1 },
      { nome: 'Embalagem', qtd: 25 },
      { nome: 'Etiqueta', qtd: 25 },
      { nome: 'Leite condensado', qtd: 1 },
      { nome: 'Leite em pó', qtd: 60 },
      { nome: 'Leite integral', qtd: 1.5 },
      { nome: 'Liga neutra', qtd: 20 },
      { nome: 'Nutella', qtd: 200 },
      { nome: 'Suco', qtd: 3 }
    ]
  },
  {
    sabor: 'Ninho com Nutella',
    rendimento: 20,
    ingredientes: [
      { nome: 'Açúcar', qtd: 590 },
      { nome: 'Creme de leite', qtd: 1 },
      { nome: 'Embalagem', qtd: 20 },
      { nome: 'Etiqueta', qtd: 20 },
      { nome: 'Leite condensado', qtd: 1 },
      { nome: 'Leite em pó', qtd: 200 },
      { nome: 'Leite integral', qtd: 1.5 },
      { nome: 'Liga neutra', qtd: 20 },
      { nome: 'Nutella', qtd: 200 }
    ]
  },
  {
    sabor: 'Ninho com Morango',
    rendimento: 20,
    ingredientes: [
      { nome: 'Açúcar', qtd: 590 },
      { nome: 'Açúcar geleia', qtd: 250 },
      { nome: 'Creme de leite', qtd: 1 },
      { nome: 'Embalagem', qtd: 20 },
      { nome: 'Etiqueta', qtd: 20 },
      { nome: 'Leite condensado', qtd: 1 },
      { nome: 'Leite em pó', qtd: 200 },
      { nome: 'Leite integral', qtd: 1.5 },
      { nome: 'Liga neutra', qtd: 20 },
      { nome: 'Morango', qtd: 350 }
    ]
  },
  {
    sabor: 'Cajá',
    rendimento: 20,
    ingredientes: [
      { nome: 'Açúcar', qtd: 400 },
      { nome: 'Creme de leite', qtd: 1 },
      { nome: 'Embalagem', qtd: 20 },
      { nome: 'Etiqueta', qtd: 20 },
      { nome: 'Leite condensado', qtd: 0 },
      { nome: 'Leite integral', qtd: 1.5 },
      { nome: 'Liga neutra', qtd: 20 },
      { nome: 'Polpa de Cajá', qtd: 700 }
    ]
  },
  {
    sabor: 'Oreo',
    rendimento: 20,
    ingredientes: [
      { nome: 'Açúcar', qtd: 400 },
      { nome: 'Creme de leite', qtd: 1 },
      { nome: 'Embalagem', qtd: 20 },
      { nome: 'Etiqueta', qtd: 20 },
      { nome: 'Leite condensado', qtd: 1 },
      { nome: 'Leite em pó', qtd: 60 },
      { nome: 'Leite integral', qtd: 1.5 },
      { nome: 'Liga neutra', qtd: 20 },
      { nome: 'Oreo', qtd: 37 }
    ]
  },
  {
    sabor: 'Abacate',
    rendimento: 20,
    ingredientes: [
      { nome: 'Açúcar', qtd: 420 },
      { nome: 'Creme de leite', qtd: 1 },
      { nome: 'Embalagem', qtd: 20 },
      { nome: 'Etiqueta', qtd: 20 },
      { nome: 'Leite condensado triângulo ', qtd: 1 },
      { nome: 'Leite em pó', qtd: 60 },
      { nome: 'Leite integral', qtd: 1.5 },
      { nome: 'Liga neutra', qtd: 20 },
      { nome: 'Polpa de Abacate', qtd: 900 }
    ]
  },
  {
    sabor: 'Zero Lactose Coco',
    rendimento: 20,
    ingredientes: [
      { nome: 'Açúcar', qtd: 200 },
      { nome: 'Coco Ralado seco', qtd: 200 },
      { nome: 'Creme de leite Zero Lactose', qtd: 1 },
      { nome: 'Embalagem', qtd: 20 },
      { nome: 'Etiqueta', qtd: 20 },
      { nome: 'Leite condensado zero lactose', qtd: 1 },
      { nome: 'Leite de coco', qtd: 1 },
      { nome: 'Leite em pó', qtd: 60 },
      { nome: 'Leite zero lactose', qtd: 1 },
      { nome: 'Liga neutra', qtd: 20 }
    ]
  },
  {
    sabor: 'Mousse de Limão',
    rendimento: 20,
    ingredientes: [
      { nome: 'Açúcar', qtd: 300 },
      { nome: 'Creme de leite', qtd: 1 },
      { nome: 'Embalagem', qtd: 20 },
      { nome: 'Etiqueta', qtd: 20 },
      { nome: 'Leite condensado', qtd: 1 },
      { nome: 'Leite em pó', qtd: 45 },
      { nome: 'Leite integral', qtd: 1 },
      { nome: 'Liga neutra', qtd: 11 },
      { nome: 'Suco', qtd: 3 }
    ]
  },
  {
    sabor: 'Abacaxi',
    rendimento: 20,
    ingredientes: [
      { nome: 'Açúcar', qtd: 200 },
      { nome: 'Açúcar geleia', qtd: 200 },
      { nome: 'Abacaxi', qtd: 1 },
      { nome: 'Creme de leite', qtd: 1 },
      { nome: 'Embalagem', qtd: 20 },
      { nome: 'Etiqueta', qtd: 20 },
      { nome: 'Leite condensado', qtd: 1 },
      { nome: 'Leite em pó', qtd: 45 },
      { nome: 'Leite integral', qtd: 1 },
      { nome: 'Liga neutra', qtd: 11 },
      { nome: 'Suco', qtd: 54 }
    ]
  },
  {
    sabor: 'Milho Verde',
    rendimento: 18,
    ingredientes: [
      { nome: 'Açúcar', qtd: 300 },
      { nome: 'Creme de leite', qtd: 1 },
      { nome: 'Embalagem', qtd: 18 },
      { nome: 'Etiqueta', qtd: 18 },
      { nome: 'Leite de coco', qtd: 1 },
      { nome: 'Leite em pó', qtd: 45 },
      { nome: 'Leite integral', qtd: 1 },
      { nome: 'Liga neutra', qtd: 11 },
      { nome: 'Milho Verde', qtd: 2 }
    ]
  },
  {
    sabor: 'Pudim',
    rendimento: 20,
    ingredientes: [
      { nome: 'Açúcar', qtd: 300 },
      { nome: 'Açúcar do caramelo', qtd: 250 },
      { nome: 'Creme de leite', qtd: 3 },
      { nome: 'Embalagem', qtd: 20 },
      { nome: 'Baunilha', qtd: 1 },
      { nome: 'Etiqueta', qtd: 20 },
      { nome: 'Leite condensado', qtd: 2 },
      { nome: 'Leite em pó', qtd: 150 },
      { nome: 'Leite integral', qtd: 2 },
      { nome: 'Liga neutra', qtd: 20 },
      { nome: 'Ovo', qtd: 6 },
      { nome: 'Sal', qtd: 1 }
    ]
  }
];

async function run() {
  for (const r of receitas) {
    await new Promise((resolve, reject) => {
      db.get('SELECT id FROM sabores WHERE nome = ?', [r.sabor], async (err, sabor) => {
        if (!sabor) {
          console.log(`Sabor não encontrado: ${r.sabor}`);
          return resolve();
        }
        const sid = sabor.id;
        db.run('UPDATE sabores SET rendimento_receita = ? WHERE id = ?', [r.rendimento, sid]);
        db.run('DELETE FROM receita_ingredientes WHERE sabor_id = ?', [sid], async () => {
          for (const ing of r.ingredientes) {
            db.get('SELECT id FROM ingredientes WHERE nome = ?', [ing.nome], (err, irow) => {
              if (irow) {
                db.run('INSERT INTO receita_ingredientes (sabor_id, ingrediente_id, quantidade) VALUES (?, ?, ?)', [sid, irow.id, ing.qtd]);
              } else {
                console.log(`Ingrediente não encontrado: ${ing.nome} (para ${r.sabor})`);
              }
            });
          }
          console.log(`Receita cadastrada: ${r.sabor}`);
          resolve();
        });
      });
    });
  }
  console.log('Fim do processamento.');
}

run();
