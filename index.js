const http = require('http');
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Health check: Project is awake!');
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Project is awake!');
  }
});
server.listen(process.env.PORT || 3000);

const fetch = require('node-fetch');

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
let notified = {}; // key: exchange pair, value: true/false
let messageId = {}; // key: exchange pair, value: message_id

async function sendTelegramMessage(message) {
  try {
    const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage?chat_id=${CHAT_ID}&text=${encodeURIComponent(message)}`);
    const data = await resp.json();
    if (data.ok && data.result && data.result.message_id) {
      return data.result.message_id;
    } else {
      return null;
    }
  } catch (e) {
    return null;
  }
}

async function deleteTelegramMessage(msgId) {
  try {
    const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage?chat_id=${CHAT_ID}&message_id=${msgId}`);
    const data = await resp.json();
    return !!data.ok;
  } catch (e) {
    return false;
  }
}

async function fetchExchangeApi(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchRates() {
  try {
    const apiEndpoints = [
      { name: 'Buenbit', url: 'https://criptoya.com/api/buenbit/USDT/PEN/1' },
      { name: 'SatoshiTango', url: 'https://criptoya.com/api/satoshitango/USDT/PEN/1' },
      { name: 'LemonCash', url: 'https://criptoya.com/api/lemoncash/USDT/PEN/1' },
      { name: 'Buda', url: 'https://criptoya.com/api/buda/USDT/PEN/1' },
      { name: 'Binance P2P', url: 'https://criptoya.com/api/binancep2p/USDT/PEN/1' },
      { name: 'Bybit P2P', url: 'https://criptoya.com/api/bybitp2p/USDT/PEN/1' }
    ];

    const results = await Promise.all(apiEndpoints.map(api =>
      fetchExchangeApi(api.url)
    ));

    if (results.every(res => res === null)) return;

    const [buenbit, satoshitango, lemoncash, buda, binanceP2P, bybitP2P] = results;

    const validExchanges = [
      { name: 'Buenbit', data: buenbit },
      { name: 'SatoshiTango', data: satoshitango },
      { name: 'LemonCash', data: lemoncash },
      { name: 'Buda', data: buda }
    ].filter(ex => ex.data);

    if (!binanceP2P || !bybitP2P || validExchanges.length === 0) return;

    for (const target of [
      { name: 'Binance P2P', data: binanceP2P },
      { name: 'Bybit P2P', data: bybitP2P }
    ]) {
      const comprar = target.data.totalAsk;
      const vender = target.data.totalBid;
      const lowestPrice = Math.min(comprar, vender);

      for (const other of validExchanges) {
        const otherComprar = other.data.totalAsk;
        const key = `${target.name}_vender_${other.name}`;
        const difference = lowestPrice - otherComprar;

        if (difference > -0.042) {
          if (!notified[key]) {
            const profit = difference * 1000;
            const valinv = otherComprar * 1000;
            const message = `🚨 Compra en ${other.name} a (${otherComprar.toFixed(3)}) y vende en ${target.name} a (${lowestPrice.toFixed(3)}) y gana ${profit.toFixed(1)} soles por cada ${valinv.toFixed(0)} soles`;
            const msgId = await sendTelegramMessage(message);
            if (msgId) {
              notified[key] = true;
              messageId[key] = msgId;
            }
          }
        } else {
          if (notified[key] && messageId[key]) {
            await deleteTelegramMessage(messageId[key]);
            notified[key] = false;
            messageId[key] = undefined;
          }
        }
      }
    }
  } catch (e) {
    // Silent catch on production
  }
}

// Run fetchRates every 10 minutes
setInterval(fetchRates, 10 * 60 * 1000);

fetchRates();
