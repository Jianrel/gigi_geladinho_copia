// Envia um aviso para o webhook do n8n, que dispara as mensagens de WhatsApp.
// Best-effort: nunca lança erro, para não derrubar a operação que já foi salva.
const http = require('http');
const https = require('https');

async function notificarN8n(body) {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  const user = process.env.N8N_USER;
  const pass = process.env.N8N_PASS;
  if (!webhookUrl || !user || !pass) {
    console.error('⚠️  N8N_WEBHOOK_URL / N8N_USER / N8N_PASS não configurados — notificação não foi enviada.');
    return false;
  }
  try {
    const payload = JSON.stringify({ body });
    const auth = Buffer.from(`${user}:${pass}`).toString('base64');
    const url = new URL(webhookUrl);
    await new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'http:' ? 80 : 443),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Authorization': `Basic ${auth}`
        }
      };
      const r = (url.protocol === 'http:' ? http : https).request(options, resp => { resp.resume(); resp.on('end', resolve); });
      r.on('error', reject);
      r.write(payload);
      r.end();
    });
    return true;
  } catch (e) {
    console.error('Erro ao notificar webhook n8n:', e.message);
    return false;
  }
}

module.exports = { notificarN8n };
