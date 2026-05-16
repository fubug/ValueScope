export type MarketId =
  | 'us_sp500'
  | 'us_nasdaq'
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
  | 'br'
  | 'gold'
  | 'us_treasury';

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
  advance_decline_ratio?: number;
  pct_above_200ma?: number;
  ytd_return?: number;
  pe_percentile?: number;
  pb_percentile?: number;
  dividend_yield?: number;
  gdp_growth?: number;
  pmi?: number;
  [key: string]: number | undefined;
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
