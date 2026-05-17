import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve('data/daily');
const MARKETS = [
  { market: 'us_sp500', market_name: '美国', index_name: 'S&P 500', base: 70,
    raw: { foreign_ownership_limit: 1.0, capital_flow_freedom: 1.0, etf_available: true, settlement_days: 1, withholding_tax: 0.10 } },
  { market: 'jp', market_name: '日本', index_name: '日经225', base: 72,
    raw: { foreign_ownership_limit: 1.0, capital_flow_freedom: 0.95, etf_available: true, settlement_days: 2, withholding_tax: 0.15 } },
  { market: 'gb', market_name: '英国', index_name: 'FTSE 100', base: 65,
    raw: { foreign_ownership_limit: 1.0, capital_flow_freedom: 0.95, etf_available: true, settlement_days: 2, withholding_tax: 0.00 } },
  { market: 'de', market_name: '德国', index_name: 'DAX', base: 67,
    raw: { foreign_ownership_limit: 1.0, capital_flow_freedom: 0.95, etf_available: true, settlement_days: 2, withholding_tax: 0.15 } },
  { market: 'fr', market_name: '法国', index_name: 'CAC 40', base: 63,
    raw: { foreign_ownership_limit: 1.0, capital_flow_freedom: 0.95, etf_available: true, settlement_days: 2, withholding_tax: 0.15 } },
  { market: 'au', market_name: '澳洲', index_name: 'ASX 200', base: 64,
    raw: { foreign_ownership_limit: 1.0, capital_flow_freedom: 0.90, etf_available: true, settlement_days: 2, withholding_tax: 0.15 } },
  { market: 'ca', market_name: '加拿大', index_name: 'S&P/TSX', base: 66,
    raw: { foreign_ownership_limit: 1.0, capital_flow_freedom: 0.95, etf_available: true, settlement_days: 2, withholding_tax: 0.15 } },
  { market: 'cn_ashare', market_name: 'A股', index_name: '沪深300', base: 62,
    raw: { foreign_ownership_limit: 0.30, capital_flow_freedom: 0.50, etf_available: true, settlement_days: 1, withholding_tax: 0.10 } },
  { market: 'cn_hk', market_name: '港股', index_name: '恒生指数', base: 58,
    raw: { foreign_ownership_limit: 1.0, capital_flow_freedom: 0.90, etf_available: true, settlement_days: 2, withholding_tax: 0.00 } },
  { market: 'kr', market_name: '韩国', index_name: 'KOSPI', base: 75,
    raw: { foreign_ownership_limit: 1.0, capital_flow_freedom: 0.70, etf_available: true, settlement_days: 2, withholding_tax: 0.15 } },
  { market: 'tw', market_name: '台湾', index_name: '加权指数', base: 73,
    raw: { foreign_ownership_limit: 1.0, capital_flow_freedom: 0.70, etf_available: true, settlement_days: 2, withholding_tax: 0.20 } },
  { market: 'in', market_name: '印度', index_name: 'Nifty 50', base: 55,
    raw: { foreign_ownership_limit: 0.30, capital_flow_freedom: 0.55, etf_available: true, settlement_days: 2, withholding_tax: 0.15 } },
  { market: 'vn', market_name: '越南', index_name: 'VN-Index', base: 58,
    raw: { foreign_ownership_limit: 0.49, capital_flow_freedom: 0.35, etf_available: false, settlement_days: 3, withholding_tax: 0.05 } },
  { market: 'br', market_name: '巴西', index_name: 'Bovespa', base: 59,
    raw: { foreign_ownership_limit: 1.0, capital_flow_freedom: 0.65, etf_available: true, settlement_days: 2, withholding_tax: 0.00 } },
];

const DIM_KEYS = ['profit_effect', 'valuation', 'scale_liquidity', 'fundamentals', 'institutional', 'risk_penalty'];
const DIM_WEIGHTS = [0.30, 0.20, 0.15, 0.15, 0.10, 0.10];

function rand(min: number, max: number) {
  return Math.round(min + Math.random() * (max - min));
}

function randf(min: number, max: number, dec = 3) {
  return +((min + Math.random() * (max - min)).toFixed(dec));
}

function generateMarket(m: typeof MARKETS[number], trendOffset: number) {
  const base = m.base + trendOffset;
  const dims = DIM_KEYS.map((key) => {
    let score: number;
    if (key === 'risk_penalty') {
      score = rand(5, 30);
    } else {
      score = Math.min(100, Math.max(0, base + rand(-20, 20)));
    }
    return { score, weight: DIM_WEIGHTS[DIM_KEYS.indexOf(key)] };
  });

  const fish_score = Math.round(dims.reduce((sum, d) => sum + d.score * d.weight, 0));

  return {
    dimensions: Object.fromEntries(DIM_KEYS.map((key, i) => [key, dims[i]])),
    fish_score,
    raw_indicators: {
      // profit_effect
      cagr_5y: randf(-0.02, 0.15, 4),
      sharpe_3y: randf(-0.2, 1.8, 2),
      positive_year_ratio_10y: randf(0.3, 0.9),
      dividend_buyback_yield: randf(0.01, 0.07, 4),
      drawdown_recovery_months: rand(2, 30),
      max_drawdown_10y: -randf(0.10, 0.50, 4),
      // valuation
      pe_ttm: randf(8, 35, 1),
      pe_percentile: randf(0.1, 0.9),
      pb_percentile: randf(0.1, 0.9),
      cape_shiller_pe: randf(10, 40, 1),
      equity_risk_premium: randf(0.01, 0.08, 4),
      bond_equity_yield_ratio: randf(0.5, 3.0, 2),
      ev_ebitda: randf(6, 25, 1),
      // scale_liquidity
      free_float_market_cap_usd: randf(5e10, 3e13, 0),
      daily_volume_usd: randf(1e9, 5e11, 0),
      turnover_rate: randf(0.003, 0.025, 4),
      bid_ask_spread_bps: randf(2, 50, 1),
      amihud_illiquidity: randf(1e-11, 1e-7, 12),
      // fundamentals
      gdp_growth_yoy: randf(-0.02, 0.08, 4),
      manufacturing_pmi: randf(45, 58, 1),
      services_pmi: randf(46, 60, 1),
      cpi_yoy: randf(0.005, 0.06, 4),
      real_interest_rate: randf(-0.03, 0.05, 4),
      earnings_growth_yoy: randf(-0.1, 0.25, 4),
      credit_spread: randf(0.005, 0.04, 4),
      unemployment_rate: randf(0.02, 0.12, 4),
      // institutional
      ...m.raw,
      investor_protection_index: randf(3.5, 8.5, 1),
      accounting_standards: [0.3, 0.5, 1.0][rand(0, 2)] as number,
      market_transparency: randf(0.3, 0.95),
      dual_listing_accessibility: Math.random() > 0.15,
      // risk_penalty
      max_drawdown_10y: -randf(0.15, 0.55, 4),
      currency_devaluation_5y: randf(-0.30, 0.10, 4),
      sovereign_cds_spread: rand(10, 200),
      correlation_with_us: randf(0.1, 0.95, 2),
      geopolitical_risk_index: rand(10, 65),
      capital_control_risk: [0, 0.05, 0.10, 0.20, 0.30, 0.35][rand(0, 5)] as number,
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
    const trendOffset = i > 60 ? -5 : i > 30 ? 0 : 3;

    const markets = MARKETS.map((m) => ({
      market: m.market,
      market_name: m.market_name,
      index_name: m.index_name,
      ...generateMarket(m, trendOffset),
    }));

    const report = { date: dateStr, markets };
    fs.writeFileSync(path.join(DATA_DIR, `${dateStr}.json`), JSON.stringify(report, null, 2));
  }

  console.log(`Generated ${days} days of data in ${DATA_DIR}`);
}

main();
