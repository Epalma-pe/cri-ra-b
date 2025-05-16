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
const TEST_THRESHOLD = -0.045;
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
let notified = {}; // key: exchange pair, value: true/false
let messageId = {}; // key: exchange pair, value: message_id

async function sendTelegramMessage(message) {
  try {
    const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage?chat_id=${CHAT_ID}&text=${encodeURIComponent(message)}`);
    const data = await resp.json();
    if (data.ok && data.result && data.result.message_id) {
      console.log('Telegram message sent:', message);
      return data.result.message_id;
    } else {
      console.error('Telegram sendMessage response error:', data);
      return null;
    }
  } catch (e) {
    console.error('Error sending Telegram message:', e);
    return null;
  }
}

async function deleteTelegramMessage(msgId) {
  try {
    const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage?chat_id=${CHAT_ID}&message_id=${msgId}`);
    const data = await resp.json();
    if (data.ok) {
      console.log('Telegram message deleted:', msgId);
      return true;
    } else {
      console.error('Telegram deleteMessage response error:', data);
      return false;
    }
  } catch (e) {
    console.error('Error deleting Telegram message:', e);
    return false;
  }
}

// Improved fetchRates function
async function fetchExchangeApi(url, name) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      console.error(`[${name}] API error:`, res.status, text);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error(`[${name}] Fetch error:`, e);
    return null;
  }
}

async function fetchRates() {
  try {
    // Define all your APIs
    const apiEndpoints = [
      { name: 'Buenbit', url: 'https://criptoya.com/api/buenbit/USDT/PEN/1' },
      { name: 'SatoshiTango', url: 'https://criptoya.com/api/satoshitango/USDT/PEN/1' },
      { name: 'LemonCash', url: 'https://criptoya.com/api/lemoncash/USDT/PEN/1' },
      { name: 'Buda', url: 'https://criptoya.com/api/buda/USDT/PEN/1' },
      { name: 'Binance P2P', url: 'https://criptoya.com/api/binancep2p/USDT/PEN/1' },
      { name: 'Bybit P2P', url: 'https://criptoya.com/api/bybitp2p/USDT/PEN/1' }
    ];

    // Fetch all APIs in parallel
    const results = await Promise.all(apiEndpoints.map(api =>
      fetchExchangeApi(api.url, api.name)
    ));

    // If all are null, bail out
    if (results.every(res => res === null)) {
      throw new Error('All exchange APIs failed');
    }

    const [buenbit, satoshitango, lemoncash, buda, binanceP2P, bybitP2P] = results;

    // Only use exchanges that responded successfully
    const validExchanges = [
      { name: 'Buenbit', data: buenbit },
      { name: 'SatoshiTango', data: satoshitango },
      { name: 'LemonCash', data: lemoncash },
      { name: 'Buda', data: buda }
    ].filter(ex => ex.data);

    if (!binanceP2P || !bybitP2P || validExchanges.length === 0) {
      console.error('Critical exchanges failed, skipping this cycle');
      return;
    }

    // -- Your trading opportunity logic --
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

        if (difference > TEST_THRESHOLD) {
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
          // If previously notified and message exists, delete it
          if (notified[key] && messageId[key]) {
            await deleteTelegramMessage(messageId[key]);
            notified[key] = false;
            messageId[key] = undefined;
          }
        }
      }
    }
    // -- End trading opportunity logic --

    console.log('Rates fetched successfully at', new Date().toLocaleString());
  } catch (e) {
    console.error('Error fetching rates:', e);
  }
}

// Run fetchRates every 10 minutes
setInterval(fetchRates, 10 * 60 * 1000);

fetchRates();
