export type MarketId =
  | 'us_sp500'
  | 'jp'
  | 'gb'
  | 'de'
  | 'fr'
  | 'au'
  | 'ca'
  | 'cn_ashare'
  | 'cn_hk'
  | 'kr'
  | 'tw'
  | 'in'
  | 'vn'
  | 'br';

export type DimensionKey =
  | 'profit_effect'
  | 'valuation'
  | 'scale_liquidity'
  | 'fundamentals'
  | 'institutional'
  | 'risk_penalty';

export interface DimensionScore {
  score: number;
  weight: number;
}

export interface RawIndicators {
  // profit_effect
  cagr_5y?: number;
  sharpe_3y?: number;
  positive_year_ratio_10y?: number;
  dividend_buyback_yield?: number;
  drawdown_recovery_months?: number;
  max_drawdown_10y?: number;
  // valuation
  pe_ttm?: number;
  pe_percentile?: number;
  pb_percentile?: number;
  cape_shiller_pe?: number;
  equity_risk_premium?: number;
  bond_equity_yield_ratio?: number;
  ev_ebitda?: number;
  // scale_liquidity
  free_float_market_cap_usd?: number;
  daily_volume_usd?: number;
  turnover_rate?: number;
  bid_ask_spread_bps?: number;
  amihud_illiquidity?: number;
  // fundamentals
  gdp_growth_yoy?: number;
  manufacturing_pmi?: number;
  services_pmi?: number;
  cpi_yoy?: number;
  real_interest_rate?: number;
  earnings_growth_yoy?: number;
  credit_spread?: number;
  unemployment_rate?: number;
  // institutional
  foreign_ownership_limit?: number;
  capital_flow_freedom?: number;
  etf_available?: boolean;
  settlement_days?: number;
  withholding_tax?: number;
  investor_protection_index?: number;
  accounting_standards?: number;
  market_transparency?: number;
  dual_listing_accessibility?: boolean;
  // risk_penalty (max_drawdown_10y 共用 profit_effect 的定义)
  currency_devaluation_5y?: number;
  sovereign_cds_spread?: number;
  correlation_with_us?: number;
  geopolitical_risk_index?: number;
  capital_control_risk?: number;
  // extensible
  [key: string]: number | boolean | undefined;
}

export interface MarketEntry {
  market: string;
  market_name: string;
  index_name: string;
  fish_score: number;
  dimensions: Record<DimensionKey, DimensionScore>;
  raw_indicators: RawIndicators;
}

export interface DailyReport {
  date: string;
  markets: MarketEntry[];
}

export interface MarketMeta {
  id: MarketId;
  name: string;
  flag: string;
  indices: string[];
  dataSource: string;
}

export interface TrendPoint {
  date: string;
  fish_score: number;
}

export interface MarketTrend {
  market: string;
  market_name: string;
  flag: string;
  data: TrendPoint[];
}

export type DateRange = '1M' | '3M' | '6M' | '1Y' | 'ALL';
