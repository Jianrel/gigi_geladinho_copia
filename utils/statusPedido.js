// Mudança de status do pedido — usada pela tela de Pedidos e pelos votos da enquete no WhatsApp.
const { db } = require('../database');
const { notificarN8n } = require('./n8n');

const STATUS_VALIDOS = ['novo', 'em_producao', 'entregue', 'cancelado'];
// ordem do andamento; cancelado fica fora
const ORDEM = { novo: 0, em_producao: 1, entregue: 2 };

function mensagemCliente(status, nome, id) {
  if (status === 'em_producao')
    return `Oi, *${nome}*! 😊\n\nSeu pedido #${id} já está sendo separado. Logo sai para entrega! 🍧`;
  if (status === 'entregue')
    return `Pedido #${id} entregue! ✅\n\nObrigada pela preferência, *${nome}* 💚 Bom geladinho!`;
  return null;
}

// Retorna { pedido, mudou } ou null se o pedido não existe.
async function mudarStatusPedido(id, status) {
  const pedido = await db.get('SELECT id, cliente_nome, telefone, status FROM pedidos WHERE id=?', [id]);
  if (!pedido) return null;
  if (pedido.status === status) return { pedido, mudou: false };

  await db.run('UPDATE pedidos SET status=? WHERE id=?', [status, id]);
  pedido.status = status;

  // pedido cancelado não vai mais ser recebido: sai do "a receber" do fluxo de caixa
  if (status === 'cancelado')
    await db.run("DELETE FROM fluxo_caixa_avulso WHERE pedido_id=? AND status='previsto'", [id]);

  const mensagem = mensagemCliente(status, pedido.cliente_nome, pedido.id);
  if (mensagem) {
    await notificarN8n({
      evento: 'status',
      status,
      cliente: { nome: pedido.cliente_nome, telefone: pedido.telefone },
      pedido: { id: pedido.id },
      mensagem
    });
  }
  return { pedido, mudou: true };
}

module.exports = { STATUS_VALIDOS, ORDEM, mudarStatusPedido };
