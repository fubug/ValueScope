import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve('data/daily');
const MARKETS = [
  { market: 'us_sp500', market_name: '美国', index_name: 'S&P 500', base: 70 },
  { market: 'us_nasdaq', market_name: '美国', index_name: '纳斯达克100', base: 68 },
  { market: 'jp', market_name: '日本', index_name: '日经225', base: 72 },
  { market: 'gb', market_name: '英国', index_name: 'FTSE 100', base: 65 },
  { market: 'de', market_name: '德国', index_name: 'DAX', base: 67 },
  { market: 'fr', market_name: '法国', index_name: 'CAC 40', base: 63 },
  { market: 'au', market_name: '澳洲', index_name: 'ASX 200', base: 64 },
  { market: 'ca', market_name: '加拿大', index_name: 'S&P/TSX', base: 66 },
  { market: 'cn_ashare', market_name: 'A股', index_name: '沪深300', base: 62 },
  { market: 'cn_hk', market_name: '港股', index_name: '恒生指数', base: 58 },
  { market: 'kr', market_name: '韩国', index_name: 'KOSPI', base: 75 },
  { market: 'tw', market_name: '台湾', index_name: '加权指数', base: 73 },
  { market: 'in', market_name: '印度', index_name: 'Nifty 50', base: 55 },
  { market: 'vn', market_name: '越南', index_name: 'VN-Index', base: 58 },
  { market: 'br', market_name: '巴西', index_name: 'Bovespa', base: 59 },
  { market: 'gold', market_name: '黄金', index_name: 'XAUUSD', base: 74 },
  { market: 'us_treasury', market_name: '美债', index_name: '10Y Treasury', base: 56 },
];

const DIM_KEYS = ['profit_effect', 'valuation', 'scale_liquidity', 'fundamentals', 'institutional', 'risk_penalty'];
const DIM_WEIGHTS = [0.30, 0.20, 0.15, 0.15, 0.10, 0.10];

function rand(min: number, max: number) {
  return Math.round(min + Math.random() * (max - min));
}

function generateMarket(base: number) {
  const dims = DIM_KEYS.map((key, i) => {
    let score: number;
    if (key === 'risk_penalty') {
      score = rand(2, 18);
    } else {
      score = Math.min(100, Math.max(0, base + rand(-20, 20)));
    }
    return { score, weight: DIM_WEIGHTS[i] };
  });

  const fish_score = Math.round(dims.reduce((sum, d) => sum + d.score * d.weight, 0));

  return {
    dimensions: Object.fromEntries(DIM_KEYS.map((key, i) => [key, dims[i]])) as Record<string, { score: number; weight: number }>,
    fish_score,
    raw_indicators: {
      ytd_return: +(Math.random() * 0.8 - 0.15).toFixed(3),
      pe_percentile: +Math.random().toFixed(2),
      pct_above_200ma: +Math.random().toFixed(2),
    },
  };
}

function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const end = new Date('2026-05-16');
  const days = 90;

  for (let i = 0; i < days; i++) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);

    const markets = MARKETS.map((m) => ({
      market: m.market,
      market_name: m.market_name,
      index_name: m.index_name,
      ...generateMarket(m.base + (i > 60 ? -5 : i > 30 ? 0 : 3)),
    }));

    const report = { date: dateStr, markets };
    fs.writeFileSync(path.join(DATA_DIR, `${dateStr}.json`), JSON.stringify(report, null, 2));
  }

  console.log(`Generated ${days} days of data in ${DATA_DIR}`);
}

main();
