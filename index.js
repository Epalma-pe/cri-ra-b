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

const exchanges = [
  { name: 'Buenbit', api: 'buenbit' },
  { name: 'SatoshiTango', api: 'satoshitango' },
  { name: 'LemonCash', api: 'lemoncash' },
  { name: 'Buda', api: 'buda' },
  { name: 'Binance P2P', api: 'binancep2p' },
  { name: 'Bybit P2P', api: 'bybitp2p' }
];

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
let notified = {}; // key: exchange pair, value: true/false
let messageId = {}; // key: exchange pair, value: message_id

// Send a Telegram message and return the message_id
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

// Delete a Telegram message using its message_id
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

async function fetchRates() {
  try {
    const [btcRes, usdRes, btcUsdRes, officialRes, ...exchangeRes] = await Promise.all([
      fetch('https://api.yadio.io/rate/pen/btc'),
      fetch('https://api.yadio.io/rate/PEN/USD'),
      fetch('https://api.yadio.io/rate/USD/BTC'),
      fetch('https://api.yadio.io/compare/1/PEN'),
      ...exchanges.map(ex => fetch(`https://criptoya.com/api/${ex.api}/USDT/PEN/1`))
    ]);

    if (!btcRes.ok || !usdRes.ok || !btcUsdRes.ok || !officialRes.ok || exchangeRes.some(res => !res.ok)) {
      throw new Error('Error en la API');
    }

    const btcData = await btcRes.json();
    const usdData = await usdRes.json();
    const btcUsdData = await btcUsdRes.json();
    const officialData = await officialRes.json();
    const exchangeData = await Promise.all(exchangeRes.map(res => res.json()));

    const binanceP2P = exchangeData[4];
    const bybitP2P = exchangeData[5];
    const otherExchanges = exchangeData.slice(0, 4);

    for (const target of [
      { name: 'Binance P2P', data: binanceP2P },
      { name: 'Bybit P2P', data: bybitP2P }
    ]) {
      const comprar = target.data.totalAsk;
      const vender = target.data.totalBid;
      const lowestPrice = Math.min(comprar, vender);

      for (const other of otherExchanges) {
        const otherComprar = other.totalAsk;
        const key = `${target.name}_vender_${otherExchanges.indexOf(other)}`;
        const difference = lowestPrice - otherComprar;

        if (difference > -0.040) {
          if (!notified[key]) {
            const profit = difference * 1000;
            const valinv = otherComprar * 1000;
            const message = `🚨 Compra en ${exchanges[exchangeData.indexOf(other)].name} a (${otherComprar.toFixed(3)}) y vende en ${target.name} a (${lowestPrice.toFixed(3)}) y gana ${profit.toFixed(1)} soles por cada ${valinv.toFixed(0)} soles`;
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

    console.log('Rates fetched successfully at', new Date().toLocaleString());
  } catch (e) {
    console.error('Error fetching rates:', e);
  }
}

// Run fetchRates every 10 minutes
setInterval(fetchRates, 10 * 60 * 1000);

fetchRates();
