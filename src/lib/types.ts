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
  | 'info_aggregation'
  | 'transaction_cost'
  | 'incentive_alignment'
  | 'risk_dispersion'
  | 'property_rights';

export interface DimensionScore {
  score: number;
  weight: number;
}

export interface RawIndicators {
  // info_aggregation
  analyst_coverage_depth?: number;
  earnings_surprise_std?: number;
  short_selling_allowed?: boolean;
  price_impact_ratio?: number;
  market_efficiency_index?: number;
  // transaction_cost
  total_commission_rate?: number;
  bid_ask_spread_bps?: number;
  settlement_days?: number;
  withholding_tax?: number;
  capital_gains_tax?: number;
  amihud_illiquidity?: number;
  // incentive_alignment
  shareholder_activism_score?: number;
  board_independence_ratio?: number;
  rpt_control_score?: number;
  earnings_quality_score?: number;
  insider_trading_enforcement?: number;
  // risk_dispersion
  derivatives_depth?: number;
  options_available?: boolean;
  capital_flow_freedom?: number;
  foreign_ownership_limit?: number;
  etf_variety?: number;
  correlation_with_global?: number;
  // property_rights
  rule_of_law_index?: number;
  judicial_independence?: number;
  fraud_enforcement_rate?: number;
  delisting_rate?: number;
  investor_protection_index?: number;
  accounting_standards?: number;
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
