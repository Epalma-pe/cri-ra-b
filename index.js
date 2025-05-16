
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
let lastNotified = {};

async function sendTelegramMessage(message) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage?chat_id=${CHAT_ID}&text=${encodeURIComponent(message)}`);
    console.log('Telegram message sent:', message);
  } catch (e) {
    console.error('Error sending Telegram message:', e);
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

      for (const other of otherExchanges) {
        const otherComprar = other.totalAsk;
        const threshold = otherComprar * 1.0037;

        if (vender > threshold) {
          const key = `${target.name}_vender_${otherExchanges.indexOf(other)}`;
          if (lastNotified[key] !== vender) {
            const profit = (vender - otherComprar) * 1000;
            const valinv = (otherComprar) *1000
            const message = `🚨 Compra en ${exchanges[exchangeData.indexOf(other)].name} a (${otherComprar.toFixed(3)}) y vende en ${target.name} a (${vender.toFixed(3)}) y gana ${profit.toFixed(1)} soles por cada ${valinv.toFixed(0)} soles`;
            await sendTelegramMessage(message);
            lastNotified[key] = vender;
          }
        }
      }
    }

    console.log('Rates fetched successfully at', new Date().toLocaleString());
  } catch (e) {
    console.error('Error fetching rates:', e);
  }
}

// Send test Telegram message immediately on start
sendTelegramMessage('Test message from Render at startup');

// Send test Telegram message every 30 minutes
setInterval(() => {
  sendTelegramMessage(`Test message from Render at ${new Date().toLocaleString()}`);
}, 11 * 60 * 1000); // Every 30 minutes

// Run fetchRates every 6 minutes
setInterval(fetchRates, 10 * 60 * 1000);

fetchRates();
