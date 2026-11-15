// 数据模型 + 判定规则
// 原则：不做加权总分（避免无法解释的"综合评分"），只做可追溯的规则判定。

export type Confidence = 'high' | 'medium' | 'low';
export type Tier = 'very-cheap' | 'cheap' | 'fair' | 'rich' | 'very-rich' | 'unknown';

export interface PercentileSet {
  y5?: number | null;
  y10?: number | null;
  y20?: number | null;
}

export interface Market {
  id: string;
  name: string;
  indexName: string;
  region: string;
  flag: string;
  currency: string;
  level: number | null;
  levelAsOf: string | null;
  valuation: {
    peTtm: number | null;
    pb: number | null;
    cape: number | null;
    dividendYield: number | null;
    peForward?: number | null;
  };
  /** 分位：0-100，越高越贵 */
  percentiles: {
    pe?: PercentileSet;
    pb?: PercentileSet;
    cape?: PercentileSet;
    /** 无长期分位时的参照说明 */
    note?: string;
  };
  rates: {
    riskFree: number | null;
    riskFreeLabel: string;
    erp: number | null;
    erpPercentile?: number | null;
    erpNote?: string;
  };
  longRun: {
    cagr10y: number | null;
    cagr20y: number | null;
    sharpe10y: number | null;
    maxDrawdown10y?: number | null;
  };
  perf: { ytd?: number | null; y1?: number | null };
  confidence: Confidence;
  /** 低置信度或需要说明的口径问题 */
  caveats: string[];
  /**
   * 人工结论。留空则只显示规则判定。
   * 设计上允许人覆盖机器，但必须留下理由。
   */
  analystView?: {
    stance: '加仓' | '持有' | '观察' | '回避';
    thesis: string;
    asOf: string;
  } | null;
}

export interface MarketsFile {
  meta: {
    snapshot: string;
    generatedBy: string;
    disclaimer: string;
    sources: { label: string; asOf: string; note?: string }[];
  };
  markets: Market[];
}

export interface FinancialPoint {
  period: string;
  revenue: number | null;
  revenueYoY: number | null;
  netProfit: number | null;
  netProfitYoY: number | null;
  roe: number | null;
  grossMargin: number | null;
  note?: string;
}

export interface ValuationModel {
  method: string;
  assumption: string;
  result: number | null;
  weight?: 'main' | 'cross';
}

export interface KeyMetric {
  label: string;
  value: string;
  asOf: string;
  signal: 'good' | 'neutral' | 'bad';
  note?: string;
}

export interface TimelineItem {
  date: string;
  event: string;
  why: string;
}

/** 深度调研：仅在有深入分析时提供，列表页不渲染 */
export interface DeepDive {
  businessModel: string;
  moat: string[];
  financials: FinancialPoint[];
  valuationModels: ValuationModel[];
  keyMetrics: KeyMetric[];
  timeline: TimelineItem[];
  /** 一句话结论：现在的价格买它，赌的是什么 */
  whatYouBet: string;
}

export interface Stock {
  ticker: string;
  name: string;
  exchange: 'SH' | 'SZ' | 'BJ';
  sector: string;
  price: number | null;
  priceAsOf: string | null;
  valuation: { peTtm: number | null; pb: number | null; dividendYield: number | null };
  fairValue: {
    low: number | null;
    mid: number | null;
    high: number | null;
    method: string;
  };
  buyZone: { normal: number | null; aggressive: number | null };
  status: 'buy' | 'watch' | 'avoid';
  thesis: string;
  risks: string[];
  lastReviewed: string;
  sample?: boolean;
  deepDive?: DeepDive;
}

export interface StocksFile {
  meta: { snapshot: string; note: string };
  stocks: Stock[];
}

export interface Sector {
  id: string;
  name: string;
  stance: '超配' | '标配' | '低配' | '回避';
  pePercentile: number | null;
  pePercentileBasis: string;
  rationale: string;
  catalysts: string[];
  risks: string[];
  watchlist: string[];
}

export interface SectorsFile {
  meta: { snapshot: string; note: string };
  sectors: Sector[];
}

/* ---------------- 规则 ---------------- */

export interface Picked {
  value: number;
  basis: string;
}

/** 取"主分位"：PE 长期分位优先，其次 PB，再次 CAPE。返回 null 表示缺数据。 */
export function pickPrimaryPercentile(m: Market): Picked | null {
  const p = m.percentiles;
  const order: Array<[keyof Market['percentiles'], keyof PercentileSet, string]> = [
    ['pe', 'y10', 'PE 10 年分位'],
    ['pe', 'y5', 'PE 5 年分位'],
    ['pe', 'y20', 'PE 20 年分位'],
    ['pb', 'y10', 'PB 10 年分位'],
    ['cape', 'y20', 'CAPE 20 年分位'],
    ['cape', 'y10', 'CAPE 10 年分位'],
  ];
  for (const [metric, win, label] of order) {
    const bucket = p[metric] as PercentileSet | undefined;
    const v = bucket?.[win];
    if (typeof v === 'number') return { value: v, basis: label };
  }
  return null;
}

const TIER_OF = (p: number): Tier => {
  if (p <= 15) return 'very-cheap';
  if (p <= 35) return 'cheap';
  if (p <= 65) return 'fair';
  if (p <= 85) return 'rich';
  return 'very-rich';
};

const TIER_LABEL: Record<Tier, string> = {
  'very-cheap': '极具性价比',
  cheap: '偏便宜',
  fair: '合理',
  rich: '偏贵',
  'very-rich': '很贵',
  unknown: '数据不足',
};

const TIER_CLASS: Record<Tier, string> = {
  'very-cheap': 'cheap',
  cheap: 'cheap',
  fair: 'fair',
  rich: 'expensive',
  'very-rich': 'expensive',
  unknown: 'unknown',
};

const TIER_ORDER: Tier[] = ['very-cheap', 'cheap', 'fair', 'rich', 'very-rich', 'unknown'];

export interface Verdict {
  tier: Tier;
  label: string;
  className: string;
  /** 判定链，逐条给用户看 */
  reasons: string[];
  order: number;
}

/**
 * 判定规则（故意保持简单可解释）：
 * 1) 以主分位落档
 * 2) ERP 分位作为修正项：>=70 分位（股票相对债券便宜）上调一档；<=30 下调一档
 * 3) 低置信度不改变档位，只在前端提示，避免"数据差还给强结论"
 */
export function judge(m: Market): Verdict {
  const primary = pickPrimaryPercentile(m);
  const reasons: string[] = [];

  if (!primary) {
    return {
      tier: 'unknown',
      label: TIER_LABEL.unknown,
      className: TIER_CLASS.unknown,
      reasons: ['缺少可用的长期估值分位，不做档位判断'],
      order: TIER_ORDER.indexOf('unknown'),
    };
  }

  let idx = TIER_ORDER.indexOf(TIER_OF(primary.value));
  reasons.push(`${primary.basis} ${primary.value.toFixed(0)} → 落在「${TIER_LABEL[TIER_ORDER[idx]]}」`);

  const erpPct = m.rates.erpPercentile;
  if (typeof erpPct === 'number') {
    if (erpPct >= 70 && idx > 0) {
      idx -= 1;
      reasons.push(`ERP 处于 ${erpPct.toFixed(0)} 分位（股票相对债券便宜），上调一档`);
    } else if (erpPct <= 30 && idx < TIER_ORDER.indexOf('very-rich')) {
      idx += 1;
      reasons.push(`ERP 处于 ${erpPct.toFixed(0)} 分位（股票相对债券贵），下调一档`);
    } else {
      reasons.push(`ERP ${erpPct.toFixed(0)} 分位，中性区间，不修正`);
    }
  } else if (typeof m.rates.erp === 'number') {
    reasons.push(
      m.rates.erp < 0
        ? `ERP ${m.rates.erp.toFixed(2)}%（负值：持有股票的预期收益低于无风险债），不构成修正但需警惕`
        : `ERP ${m.rates.erp.toFixed(2)}%，缺少历史分位，不参与修正`
    );
  }

  const tier = TIER_ORDER[idx];
  return {
    tier,
    label: TIER_LABEL[tier],
    className: TIER_CLASS[tier],
    reasons,
    order: idx,
  };
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: '数据可靠',
  medium: '部分口径待核',
  low: '置信度低',
};

/** 个股排序：状态优先（buy → watch → avoid），组内按安全边际降序 */
export function sortStocks(list: Stock[]): Stock[] {
  const rank = { buy: 0, watch: 1, avoid: 2 } as const;
  return [...list].sort((a, b) => {
    const r = rank[a.status] - rank[b.status];
    if (r !== 0) return r;
    return (marginOfSafety(b) ?? -99) - (marginOfSafety(a) ?? -99);
  });
}

/** 安全边际 =（合理价值中值 - 现价）/ 合理价值中值 */
export function marginOfSafety(s: Stock): number | null {
  if (s.price == null || s.fairValue.mid == null || s.fairValue.mid <= 0) return null;
  return (s.fairValue.mid - s.price) / s.fairValue.mid;
}

export const STATUS_LABEL: Record<Stock['status'], string> = {
  buy: '可买入区间',
  watch: '需观察',
  avoid: '便宜但不买',
};
