const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('gigi_estoque.db');

db.get('SELECT id FROM sabores WHERE nome = ?', ['Coco'], (err, sabor) => {
  if (err || !sabor) { console.error('Sabor não encontrado', err); return; }
  
  const sabor_id = sabor.id;
  const rendimento = 25;
  
  const ingredientes_nome = [
    { nome: 'Açúcar', qtd: 450 },
    { nome: 'Coco Ralado seco', qtd: 100 },
    { nome: 'Coco Ralado fresco', qtd: 100 },
    { nome: 'Creme de leite', qtd: 1 },
    { nome: 'Embalagem', qtd: 25 },
    { nome: 'Etiqueta', qtd: 25 },
    { nome: 'Leite condensado', qtd: 1 },
    { nome: 'Leite de coco', qtd: 1 },
    { nome: 'Leite em pó', qtd: 60 },
    { nome: 'Leite integral', qtd: 1500 },
    { nome: 'Liga neutra', qtd: 20 }
  ];
  
  db.run('UPDATE sabores SET rendimento_receita = ? WHERE id = ?', [rendimento, sabor_id], () => {
    db.run('DELETE FROM receita_ingredientes WHERE sabor_id = ?', [sabor_id], async () => {
      
      for (const ing of ingredientes_nome) {
        db.get('SELECT id FROM ingredientes WHERE nome = ?', [ing.nome], (err, row) => {
          if (row) {
            db.run('INSERT INTO receita_ingredientes (sabor_id, ingrediente_id, quantidade) VALUES (?, ?, ?)', [sabor_id, row.id, ing.qtd]);
            console.log('Adicionado:', ing.nome);
          } else {
            console.log('Ingrediente não encontrado:', ing.nome);
          }
        });
      }
    });
  });
});
