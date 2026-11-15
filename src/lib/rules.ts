// 数据模型 + 判定规则
// 原则：不做加权总分（避免无法解释的"综合评分"），只做可追溯的规则判定。

export type Confidence = 'high' | 'medium' | 'low';
export type Tier = 'very-cheap' | 'cheap' | 'fair' | 'rich' | 'very-rich' | 'unknown';

/* ============================================================
 * 三层过滤器
 * ------------------------------------------------------------
 * 缘起：2026-11 复核时发现，只靠「历史估值分位 + 固定 20% 折价」
 * 会得出「六只全部观察」这种看起来像偷懒的结论。原因是三个口径缺陷：
 *   1) 只有相对锚（相对自己历史），没有绝对锚（相对无风险利率）
 *   2) 固定 20% 折价不分确定性，对高确定性公司过于苛刻、
 *      对低确定性公司又过于宽松
 *   3) 没有一票否决位，硬伤被「便宜」抵掉了
 * 所以改成三层，任何一层不过都要在页面上显示卡在哪。
 * 买入价和状态都不再手填，全部由下面这组规则派生。
 * ============================================================ */

export type Certainty = 'high' | 'medium' | 'low';

export const CERTAINTY_LABEL: Record<Certainty, string> = {
  high: '高确定性',
  medium: '中确定性',
  low: '低确定性',
};

export const CERTAINTY_HINT: Record<Certainty, string> = {
  high: '现金流可预测、护城河十年内难被拿走、需求不依赖单一政策',
  medium: '生意能看懂，但盈利受周期或单一变量影响较大',
  low: '盈利假设本身存疑，或行业定价框架正在切换',
};

/**
 * 要求的折价 = 安全边际门槛。
 * 确定性越高，需要的折价越小 —— 这是唯一一处调参入口，改这里全局生效。
 * 高 12% ≈ 历史中枢九五折上再让一点；低 32% ≈ 只在对公司极度悲观的时点才买。
 */
export const REQUIRED_DISCOUNT: Record<Certainty, number> = {
  high: 0.12,
  medium: 0.22,
  low: 0.32,
};

/** 激进档在正常档基础上再多要 10 个百分点折价 */
export const AGGRESSIVE_EXTRA = 0.1;

/** 绝对锚：股息率 − 10Y 国债 的利差下限（单位：百分点） */
export const ANCHOR_MIN_SPREAD = 2.0;

/** 派息率上限（%）：超过它说明分红可能不是自由现金流支撑的，利差含水分 */
export const PAYOUT_MAX = 70;

export interface RiskFree {
  value: number;
  label: string;
  asOf: string;
}

/** 反证条件：哪一条成立，前面的便宜结论就该作废 */
export interface Veto {
  triggered: boolean;
  condition: string;
  /** 触发时的实际观测值，没触发也要写清现在离触发还有多远 */
  observation: string;
}

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
  /** 必填：决定要求折价，进而决定买入价。缺它校验不通过。 */
  certainty: Certainty;
  /** 必填：派息率（%），用于判断高股息是不是借债分红。允许与 DY×PE 有口径差，需在 anchorNote 说明 */
  payoutRatio: number | null;
  /** 必填：分红可持续性的一句话判断，绝对锚不能只看利差大小 */
  anchorNote: string;
  /** 必填：反证条件。triggered=true 的标的不得进入买入区 */
  veto: Veto;
  status: 'buy' | 'watch' | 'avoid';
  thesis: string;
  risks: string[];
  lastReviewed: string;
  sample?: boolean;
  deepDive?: DeepDive;
}

export interface StocksFile {
  meta: {
    snapshot: string;
    note: string;
    /** 绝对锚的分母。放在文件级而不是每只股票里，避免各写各的国债收益率 */
    riskFree: RiskFree;
  };
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

/** 安全边际 =（合理价值中值 - 现价）/ 合理价值中值 */
export function marginOfSafety(s: Stock): number | null {
  if (s.price == null || s.fairValue.mid == null || s.fairValue.mid <= 0) return null;
  return (s.fairValue.mid - s.price) / s.fairValue.mid;
}

/** 股息利差（百分点）：股息率 − 10Y 国债。绝对锚的唯一来源 */
export function dividendSpread(s: Stock, rf: number): number | null {
  const dy = s.valuation.dividendYield;
  if (dy == null) return null;
  return dy - rf;
}

/** 买入价由确定性派生，不手填 —— 这样「阈值」只有一份，改规则即全局生效 */
export function buyZoneOf(s: Stock): { normal: number | null; aggressive: number | null; discount: number } {
  const mid = s.fairValue.mid;
  const discount = REQUIRED_DISCOUNT[s.certainty] ?? REQUIRED_DISCOUNT.low;
  if (mid == null || mid <= 0) return { normal: null, aggressive: null, discount };
  const round = (v: number) => Math.round(v * 100) / 100;
  return {
    normal: round(mid * (1 - discount)),
    aggressive: round(mid * (1 - discount - AGGRESSIVE_EXTRA)),
    discount,
  };
}

/** 距正常买入价还有多远：负数 = 已进入买入区，正数 = 还要再跌这么多 */
export function distanceToBuy(s: Stock): number | null {
  const { normal } = buyZoneOf(s);
  if (normal == null || normal <= 0 || s.price == null) return null;
  return (s.price - normal) / normal;
}

export type CheckState = 'pass' | 'partial' | 'fail';

export interface LayerResult {
  layer: 1 | 2 | 3;
  name: string;
  state: CheckState;
  headline: string;
  detail: string;
}

const STATE_RANK: Record<CheckState, number> = { pass: 0, partial: 1, fail: 2 };

/**
 * 三层判定。顺序即优先级，页面上按这个顺序展示，一眼看出卡在哪。
 *   层1 绝对锚：股息利差够不够宽 + 分红是不是真金白银
 *   层2 相对锚：相对自己的合理价值，折价够不够（门槛随确定性变）
 *   层3 反证：有没有已触发的硬伤，一票否决
 */
export function threeLayer(s: Stock, rf: number): LayerResult[] {
  const layers: LayerResult[] = [];

  /* --- 层1 绝对锚 --- */
  const spread = dividendSpread(s, rf);
  const payout = s.payoutRatio;
  {
    let state: CheckState = 'fail';
    let headline = '';
    if (spread == null) {
      state = 'fail';
      headline = '缺股息率，无法验证绝对锚';
    } else if (spread < ANCHOR_MIN_SPREAD) {
      state = 'fail';
      headline = `利差 ${spread.toFixed(2)}pct，不足 ${ANCHOR_MIN_SPREAD}pct`;
    } else if (payout == null || payout > PAYOUT_MAX) {
      state = 'partial';
      headline = `利差 ${spread.toFixed(2)}pct 够宽，但派息率 ${payout == null ? '缺失' : payout.toFixed(0) + '%'} 偏高`;
    } else {
      state = 'pass';
      headline = `利差 ${spread.toFixed(2)}pct，派息率 ${payout.toFixed(0)}%`;
    }
    layers.push({
      layer: 1,
      name: '绝对锚：股息率 − 国债',
      state,
      headline,
      detail: s.anchorNote,
    });
  }

  /* --- 层2 相对锚 --- */
  const mos = marginOfSafety(s);
  const { normal, discount } = buyZoneOf(s);
  {
    let state: CheckState = 'fail';
    let headline = '';
    if (mos == null || normal == null) {
      headline = '缺现价或合理价值';
    } else if (mos >= discount) {
      state = 'pass';
      headline = `安全边际 ${(mos * 100).toFixed(1)}% ≥ 门槛 ${(discount * 100).toFixed(0)}%`;
    } else {
      const gap = distanceToBuy(s);
      headline = `安全边际 ${(mos * 100).toFixed(1)}%，未达 ${(discount * 100).toFixed(0)}% 门槛${
        gap == null ? '' : `，还差 ${(gap * 100).toFixed(1)}%`
      }`;
    }
    layers.push({
      layer: 2,
      name: '相对锚：折价够不够',
      state,
      headline,
      detail: `${CERTAINTY_LABEL[s.certainty]} → 要求 ${(discount * 100).toFixed(0)}% 折价，对应买入价 ${
        normal == null ? '—' : normal.toFixed(2)
      }`,
    });
  }

  /* --- 层3 反证 --- */
  {
    layers.push({
      layer: 3,
      name: '反证：硬伤是否已触发',
      state: s.veto.triggered ? 'fail' : 'pass',
      headline: s.veto.triggered ? '已触发，一票否决' : '未触发',
      detail: `${s.veto.condition}｜现状：${s.veto.observation}`,
    });
  }

  return layers;
}

/**
 * 状态由三层派生，不接受手填。
 *   三层全过 → buy
 *   折价够但硬伤已触发 → avoid（便宜但不买）
 *   折价不够 → watch（价格问题，等）
 *   折价够、没硬伤、但绝对锚不过 → watch（相对便宜但绝对吸引力不足，不构成出手理由）
 */
export function deriveStatus(s: Stock, rf: number): Stock['status'] {
  const [l1, l2, l3] = threeLayer(s, rf);
  if (l2.state === 'pass' && l3.state === 'pass' && l1.state === 'pass') return 'buy';
  if (l2.state === 'pass' && l3.state === 'fail') return 'avoid';
  return 'watch';
}

/** 卡在第几层：返回最靠前的未通过层号，全过返回 0 */
export function stuckAt(s: Stock, rf: number): number {
  const failed = threeLayer(s, rf).filter((l) => l.state !== 'pass');
  if (failed.length === 0) return 0;
  return Math.min(...failed.map((l) => l.layer));
}

/** 个股排序：先按「距买入价」升序（最接近的在前），同档再按卡住的层数 */
export function sortStocks(list: Stock[], rf: number): Stock[] {
  const rank = { buy: 0, watch: 1, avoid: 2 } as const;
  return [...list].sort((a, b) => {
    const r = rank[deriveStatus(a, rf)] - rank[deriveStatus(b, rf)];
    if (r !== 0) return r;
    return (distanceToBuy(a) ?? 99) - (distanceToBuy(b) ?? 99);
  });
}

export const STATUS_LABEL: Record<Stock['status'], string> = {
  buy: '可买入区间',
  watch: '需观察',
  avoid: '便宜但不买',
};

export const STATE_LABEL: Record<CheckState, string> = {
  pass: '通过',
  partial: '部分',
  fail: '未过',
};

export { STATE_RANK };
