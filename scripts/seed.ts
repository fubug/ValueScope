import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve('data/daily');

const MARKETS = [
  { market: 'us_sp500', market_name: '美国', index_name: 'S&P 500', base: 85,
    raw: { analyst_coverage_depth: 0.95, short_selling_allowed: true, total_commission_rate: 0.0005, bid_ask_spread_bps: 3, settlement_days: 1, withholding_tax: 0.10, capital_gains_tax: 0.00, shareholder_activism_score: 0.90, board_independence_ratio: 0.85, rpt_control_score: 0.85, short_selling_allowed: true, earnings_quality_score: 0.85, insider_trading_enforcement: 0.90, derivatives_depth: 0.95, options_available: true, capital_flow_freedom: 1.0, foreign_ownership_limit: 1.0, etf_variety: 0.95, correlation_with_global: 0.85, rule_of_law_index: 0.90, judicial_independence: 0.88, fraud_enforcement_rate: 0.90, delisting_rate: 0.055, investor_protection_index: 8.3, accounting_standards: 1.0 } },
  { market: 'jp', market_name: '日本', index_name: '日经225', base: 72,
    raw: { analyst_coverage_depth: 0.75, short_selling_allowed: true, total_commission_rate: 0.001, bid_ask_spread_bps: 5, settlement_days: 2, withholding_tax: 0.15, capital_gains_tax: 0.20, shareholder_activism_score: 0.50, board_independence_ratio: 0.60, rpt_control_score: 0.70, earnings_quality_score: 0.75, insider_trading_enforcement: 0.65, derivatives_depth: 0.75, options_available: true, capital_flow_freedom: 0.95, foreign_ownership_limit: 1.0, etf_variety: 0.80, correlation_with_global: 0.60, rule_of_law_index: 0.85, judicial_independence: 0.80, fraud_enforcement_rate: 0.70, delisting_rate: 0.020, investor_protection_index: 7.1, accounting_standards: 1.0 } },
  { market: 'gb', market_name: '英国', index_name: 'FTSE 100', base: 78,
    raw: { analyst_coverage_depth: 0.80, short_selling_allowed: true, total_commission_rate: 0.001, bid_ask_spread_bps: 4, settlement_days: 2, withholding_tax: 0.00, capital_gains_tax: 0.20, shareholder_activism_score: 0.80, board_independence_ratio: 0.80, rpt_control_score: 0.85, earnings_quality_score: 0.80, insider_trading_enforcement: 0.80, derivatives_depth: 0.80, options_available: true, capital_flow_freedom: 0.95, foreign_ownership_limit: 1.0, etf_variety: 0.85, correlation_with_global: 0.70, rule_of_law_index: 0.90, judicial_independence: 0.88, fraud_enforcement_rate: 0.80, delisting_rate: 0.035, investor_protection_index: 8.0, accounting_standards: 1.0 } },
  { market: 'de', market_name: '德国', index_name: 'DAX', base: 76,
    raw: { analyst_coverage_depth: 0.80, short_selling_allowed: true, total_commission_rate: 0.0012, bid_ask_spread_bps: 5, settlement_days: 2, withholding_tax: 0.15, capital_gains_tax: 0.26, shareholder_activism_score: 0.70, board_independence_ratio: 0.75, rpt_control_score: 0.80, earnings_quality_score: 0.80, insider_trading_enforcement: 0.75, derivatives_depth: 0.75, options_available: true, capital_flow_freedom: 0.95, foreign_ownership_limit: 1.0, etf_variety: 0.85, correlation_with_global: 0.72, rule_of_law_index: 0.92, judicial_independence: 0.90, fraud_enforcement_rate: 0.80, delisting_rate: 0.030, investor_protection_index: 8.2, accounting_standards: 1.0 } },
  { market: 'fr', market_name: '法国', index_name: 'CAC 40', base: 74,
    raw: { analyst_coverage_depth: 0.75, short_selling_allowed: true, total_commission_rate: 0.0012, bid_ask_spread_bps: 5, settlement_days: 2, withholding_tax: 0.15, capital_gains_tax: 0.30, shareholder_activism_score: 0.65, board_independence_ratio: 0.70, rpt_control_score: 0.75, earnings_quality_score: 0.75, insider_trading_enforcement: 0.70, derivatives_depth: 0.70, options_available: true, capital_flow_freedom: 0.95, foreign_ownership_limit: 1.0, etf_variety: 0.80, correlation_with_global: 0.70, rule_of_law_index: 0.87, judicial_independence: 0.82, fraud_enforcement_rate: 0.75, delisting_rate: 0.025, investor_protection_index: 7.8, accounting_standards: 1.0 } },
  { market: 'au', market_name: '澳洲', index_name: 'ASX 200', base: 76,
    raw: { analyst_coverage_depth: 0.70, short_selling_allowed: true, total_commission_rate: 0.001, bid_ask_spread_bps: 5, settlement_days: 2, withholding_tax: 0.15, capital_gains_tax: 0.00, shareholder_activism_score: 0.70, board_independence_ratio: 0.75, rpt_control_score: 0.80, earnings_quality_score: 0.78, insider_trading_enforcement: 0.75, derivatives_depth: 0.60, options_available: true, capital_flow_freedom: 0.90, foreign_ownership_limit: 1.0, etf_variety: 0.70, correlation_with_global: 0.60, rule_of_law_index: 0.93, judicial_independence: 0.90, fraud_enforcement_rate: 0.80, delisting_rate: 0.040, investor_protection_index: 8.2, accounting_standards: 1.0 } },
  { market: 'ca', market_name: '加拿大', index_name: 'S&P/TSX', base: 77,
    raw: { analyst_coverage_depth: 0.75, short_selling_allowed: true, total_commission_rate: 0.001, bid_ask_spread_bps: 4, settlement_days: 2, withholding_tax: 0.15, capital_gains_tax: 0.00, shareholder_activism_score: 0.75, board_independence_ratio: 0.80, rpt_control_score: 0.80, earnings_quality_score: 0.80, insider_trading_enforcement: 0.78, derivatives_depth: 0.65, options_available: true, capital_flow_freedom: 0.95, foreign_ownership_limit: 1.0, etf_variety: 0.75, correlation_with_global: 0.72, rule_of_law_index: 0.93, judicial_independence: 0.90, fraud_enforcement_rate: 0.82, delisting_rate: 0.040, investor_protection_index: 8.3, accounting_standards: 1.0 } },
  { market: 'cn_ashare', market_name: 'A股', index_name: '沪深300', base: 42,
    raw: { analyst_coverage_depth: 0.55, short_selling_allowed: true, total_commission_rate: 0.0003, bid_ask_spread_bps: 8, settlement_days: 1, withholding_tax: 0.10, capital_gains_tax: 0.00, shareholder_activism_score: 0.15, board_independence_ratio: 0.40, rpt_control_score: 0.35, earnings_quality_score: 0.40, insider_trading_enforcement: 0.30, derivatives_depth: 0.30, options_available: true, capital_flow_freedom: 0.50, foreign_ownership_limit: 0.30, etf_variety: 0.50, correlation_with_global: 0.25, rule_of_law_index: 0.50, judicial_independence: 0.35, fraud_enforcement_rate: 0.30, delisting_rate: 0.005, investor_protection_index: 4.6, accounting_standards: 0.5 } },
  { market: 'cn_hk', market_name: '港股', index_name: '恒生指数', base: 62,
    raw: { analyst_coverage_depth: 0.70, short_selling_allowed: true, total_commission_rate: 0.0008, bid_ask_spread_bps: 5, settlement_days: 2, withholding_tax: 0.00, capital_gains_tax: 0.00, shareholder_activism_score: 0.55, board_independence_ratio: 0.65, rpt_control_score: 0.65, earnings_quality_score: 0.65, insider_trading_enforcement: 0.60, derivatives_depth: 0.55, options_available: true, capital_flow_freedom: 0.90, foreign_ownership_limit: 1.0, etf_variety: 0.70, correlation_with_global: 0.55, rule_of_law_index: 0.80, judicial_independence: 0.78, fraud_enforcement_rate: 0.65, delisting_rate: 0.015, investor_protection_index: 7.3, accounting_standards: 1.0 } },
  { market: 'kr', market_name: '韩国', index_name: 'KOSPI', base: 58,
    raw: { analyst_coverage_depth: 0.60, short_selling_allowed: true, total_commission_rate: 0.0015, bid_ask_spread_bps: 8, settlement_days: 2, withholding_tax: 0.15, capital_gains_tax: 0.22, shareholder_activism_score: 0.35, board_independence_ratio: 0.55, rpt_control_score: 0.60, earnings_quality_score: 0.55, insider_trading_enforcement: 0.50, derivatives_depth: 0.50, options_available: true, capital_flow_freedom: 0.70, foreign_ownership_limit: 1.0, etf_variety: 0.60, correlation_with_global: 0.55, rule_of_law_index: 0.72, judicial_independence: 0.65, fraud_enforcement_rate: 0.55, delisting_rate: 0.010, investor_protection_index: 6.2, accounting_standards: 1.0 } },
  { market: 'tw', market_name: '台湾', index_name: '加权指数', base: 60,
    raw: { analyst_coverage_depth: 0.65, short_selling_allowed: true, total_commission_rate: 0.0015, bid_ask_spread_bps: 7, settlement_days: 2, withholding_tax: 0.20, capital_gains_tax: 0.00, shareholder_activism_score: 0.40, board_independence_ratio: 0.55, rpt_control_score: 0.55, earnings_quality_score: 0.55, insider_trading_enforcement: 0.50, derivatives_depth: 0.50, options_available: true, capital_flow_freedom: 0.70, foreign_ownership_limit: 1.0, etf_variety: 0.60, correlation_with_global: 0.60, rule_of_law_index: 0.75, judicial_independence: 0.70, fraud_enforcement_rate: 0.55, delisting_rate: 0.008, investor_protection_index: 7.0, accounting_standards: 1.0 } },
  { market: 'in', market_name: '印度', index_name: 'Nifty 50', base: 45,
    raw: { analyst_coverage_depth: 0.50, short_selling_allowed: true, total_commission_rate: 0.002, bid_ask_spread_bps: 10, settlement_days: 2, withholding_tax: 0.15, capital_gains_tax: 0.10, shareholder_activism_score: 0.25, board_independence_ratio: 0.45, rpt_control_score: 0.40, earnings_quality_score: 0.45, insider_trading_enforcement: 0.35, derivatives_depth: 0.35, options_available: true, capital_flow_freedom: 0.55, foreign_ownership_limit: 0.30, etf_variety: 0.45, correlation_with_global: 0.35, rule_of_law_index: 0.55, judicial_independence: 0.50, fraud_enforcement_rate: 0.40, delisting_rate: 0.015, investor_protection_index: 4.5, accounting_standards: 0.5 } },
  { market: 'vn', market_name: '越南', index_name: 'VN-Index', base: 25,
    raw: { analyst_coverage_depth: 0.20, short_selling_allowed: false, total_commission_rate: 0.003, bid_ask_spread_bps: 35, settlement_days: 3, withholding_tax: 0.05, capital_gains_tax: 0.00, shareholder_activism_score: 0.05, board_independence_ratio: 0.25, rpt_control_score: 0.20, earnings_quality_score: 0.25, insider_trading_enforcement: 0.15, derivatives_depth: 0.05, options_available: false, capital_flow_freedom: 0.35, foreign_ownership_limit: 0.49, etf_variety: 0.15, correlation_with_global: 0.25, rule_of_law_index: 0.40, judicial_independence: 0.30, fraud_enforcement_rate: 0.20, delisting_rate: 0.002, investor_protection_index: 3.5, accounting_standards: 0.3 } },
  { market: 'br', market_name: '巴西', index_name: 'Bovespa', base: 48,
    raw: { analyst_coverage_depth: 0.50, short_selling_allowed: true, total_commission_rate: 0.002, bid_ask_spread_bps: 12, settlement_days: 2, withholding_tax: 0.00, capital_gains_tax: 0.15, shareholder_activism_score: 0.30, board_independence_ratio: 0.45, rpt_control_score: 0.45, earnings_quality_score: 0.45, insider_trading_enforcement: 0.40, derivatives_depth: 0.40, options_available: true, capital_flow_freedom: 0.65, foreign_ownership_limit: 1.0, etf_variety: 0.50, correlation_with_global: 0.50, rule_of_law_index: 0.50, judicial_independence: 0.45, fraud_enforcement_rate: 0.45, delisting_rate: 0.008, investor_protection_index: 5.2, accounting_standards: 0.5 } },
];

const DIM_KEYS = ['info_aggregation', 'transaction_cost', 'incentive_alignment', 'risk_dispersion', 'property_rights'];
const DIM_WEIGHT = 0.20;

function rand(min: number, max: number) {
  return Math.round(min + Math.random() * (max - min));
}

function randf(min: number, max: number, dec = 3) {
  return +((min + Math.random() * (max - min)).toFixed(dec));
}

function generateMarket(m: typeof MARKETS[number], trendOffset: number) {
  const base = m.base + trendOffset;
  const dims = DIM_KEYS.map(() => {
    const score = Math.min(100, Math.max(0, base + rand(-10, 10)));
    return { score, weight: DIM_WEIGHT };
  });

  const fish_score = Math.round(dims.reduce((sum, d) => sum + d.score * d.weight, 0));

  return {
    dimensions: Object.fromEntries(DIM_KEYS.map((key, i) => [key, dims[i]])),
    fish_score,
    raw_indicators: {
      ...m.raw,
      price_impact_ratio: randf(0.25, 0.85),
      market_efficiency_index: randf(0.15, 0.80),
      amihud_illiquidity: randf(1e-11, 1e-7, 12),
    },
  };
}

function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const end = new Date('2026-05-17');
  const days = 90;

  for (let i = 0; i < days; i++) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const trendOffset = i > 60 ? -3 : i > 30 ? 0 : 2;

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
