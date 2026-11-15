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

/* ============================================================
 * ETF
 * ------------------------------------------------------------
 * ETF 与个股的定价逻辑不同，三层检查的内容也不同：
 *   ① 成本层：折溢价 + 综合费率 —— 这是「确定性的损耗」，不依赖任何预测
 *   ② 估值层：底层指数的历史分位 —— 便宜不便宜看这里，不看 ETF 自己的价格
 *   ③ 可用层：申购状态 + 流动性 —— 工具坏了，估值再便宜也执行不了
 * 关键区别：个股的「安全边际」靠价格下跌获得；ETF 的额外收益很大一部分
 * 靠「不付溢价」获得。溢价 6% 相当于好几年费率，这个换算比看分位更实用。
 * ============================================================ */

export type EtfType = 'QDII-LOF' | 'QDII-ETF' | 'ETF' | 'LOF';
export type Subscription = 'open' | 'limited' | 'suspended';

export interface EtfIndex {
  id: string;
  name: string;
  code: string;
  currency: string;
  pe: number | null;
  pePct: { y3?: number | null; y5?: number | null; y10?: number | null };
  pb: number | null;
  pbPct: { y3?: number | null; y5?: number | null; y10?: number | null };
  dividendYield: number | null;
  /** ROE（%）= PB / PE。PE 分位与 PB 分位的背离就是它造成的，缺了它无法解释背离 */
  roe?: number | null;
  /** 指数实际发布日期。缺省视为历史足够长；填了就用来判断「10 年分位里有几年是回溯的」 */
  inceptionDate?: string | null;
  /** 编制方法重大变更。变更前后不是同一个指数，分位序列在此处断开 */
  methodologyChanges?: Array<{ date: string; summary: string }> | null;
  asOf: string;
  peCaveat?: string;
  sources: string[];
}

export interface Etf {
  code: string;
  name: string;
  fullName: string;
  exchange: 'SH' | 'SZ';
  type: EtfType;
  indexId: string;
  price: number | null;
  nav: number | null;
  priceAsOf: string | null;
  navAsOf: string | null;
  /** 溢价率（%），正为溢价、负为折价。null = 未取得，不填推测值 */
  premium: number | null;
  premiumNote: string;
  fee: { manage: number | null; custody: number | null; total: number | null; note: string };
  scale: number | null;
  scaleAsOf: string | null;
  /** 日均成交额（亿元） */
  turnover: number | null;
  turnoverAsOf: string | null;
  subscription: Subscription;
  subscriptionNote: string;
  trackingError: number | null;
  role: string;
  caveats: string[];
  lastReviewed: string;
}

export interface EtfsFile {
  meta: { snapshot: string; note: string; riskFree: RiskFree; disclaimer: string };
  indices: EtfIndex[];
  etfs: Etf[];
}

/** 境内 ETF 溢价容忍度（%） */
export const ETF_PREMIUM_MAX = 1.0;
/** QDII 因额度限制、申赎不畅，放宽到 2%，但仍不该为溢价付钱 */
export const ETF_PREMIUM_MAX_QDII = 2.0;
/** 综合费率上限（%/年）：管理 + 托管 */
export const ETF_FEE_MAX = 1.0;
/**
 * 同指数相对成本：绝对阈值只能抓「费率离谱」，抓不到「同一指数有 0.20% 的产品，你买了 0.60%」。
 * 0.60% 本身不算贵（低于 1.0% 上限），但同表里有一模一样的产品只要 0.20%，
 * 多付的 0.40pct/年 买不到任何东西——这在 513040 与 513770 上是活案例：
 * 同为 52 亿规模、4.6 亿日均成交、跟踪同一个 931637，费率差 3 倍。
 * 只降级为 partial 而非 fail：规模大的产品可能确实值一点流动性溢价，这个取舍留给人判断。
 */
export const PEER_FEE_GAP = 0.2;
export const PEER_FEE_RATIO = 1.5;
/** 日均成交额下限（亿元），低于此滑点会吃掉收益 */
export const ETF_TURNOVER_MIN = 0.5;

export const SUBSCRIPTION_LABEL: Record<Subscription, string> = {
  open: '正常申赎',
  limited: '额度受限',
  suspended: '暂停申购',
};

export const isQdii = (e: Etf) => e.type === 'QDII-LOF' || e.type === 'QDII-ETF';

export function premiumLimit(e: Etf): number {
  return isQdii(e) ? ETF_PREMIUM_MAX_QDII : ETF_PREMIUM_MAX;
}

/** 溢价相当于多少年的综合费率——把「贵一点」翻译成可比较的时间单位 */
export function premiumInFeeYears(e: Etf): number | null {
  if (e.premium == null || e.fee.total == null || e.fee.total <= 0) return null;
  return e.premium / e.fee.total;
}

/** 同指数内的最低费率。peers 缺省时返回 null，规则退化为「只看绝对阈值」 */
export function peerFee(
  e: Etf,
  peers?: Etf[]
): { min: number; count: number; codes: string[]; ratio: number } | null {
  if (!peers || peers.length < 2 || typeof e.fee?.total !== 'number') return null;
  const same = peers.filter((p) => p.indexId === e.indexId && typeof p.fee?.total === 'number');
  if (same.length < 2) return null;
  const min = Math.min(...same.map((p) => p.fee!.total as number));
  return {
    min,
    count: same.length,
    codes: same.filter((p) => p.fee!.total === min).map((p) => p.code),
    ratio: min > 0 ? e.fee!.total / min : 1,
  };
}

/** 底层指数的主分位：PE 10 年优先，其次 5 年、3 年 */
export function indexPercentile(
  idx: EtfIndex | undefined
): { value: number; basis: string; window: 'y3' | 'y5' | 'y10' } | null {
  if (!idx) return null;
  const order: Array<[keyof EtfIndex['pePct'], string]> = [
    ['y10', 'PE 10 年分位'],
    ['y5', 'PE 5 年分位'],
    ['y3', 'PE 3 年分位'],
  ];
  for (const [w, label] of order) {
    const v = idx.pePct[w];
    if (typeof v === 'number') return { value: v, basis: label, window: w as 'y3' | 'y5' | 'y10' };
  }
  return null;
}

export interface PctReliability {
  level: 'high' | 'medium' | 'low';
  reason: string;
}

const YEARS = (from: string, to: string) =>
  (new Date(to).getTime() - new Date(from).getTime()) / (365.25 * 864e5);

/**
 * 分位可信度——这一层是为了防止「拿一个不可比的分位当便宜的证据」。
 *
 * 分位通过 ≠ 便宜。分位只说明「比自己过去便宜」，前提是过去那段样本与现在是同一个东西。
 * 有两种情况会破坏这个前提，而且都很常见：
 *   ① 指数发布时间不足 10 年，却用了 10 年分位 —— 那段历史是回溯模拟出来的，
 *      成分股按今天的规则倒推，不等于当年真实存在过的组合。
 *   ② 编制方法近期大改（成分数量、选股规则）—— 变更前后不是同一个指数，
 *      拿变更前的分位去衡量变更后的估值，等于用旧尺子量新东西。
 *
 * 判定：样本不足 10 年 → low（分位通过也只算 partial）；编制有变更 → medium（通过但标注）。
 */
export function percentileReliability(
  idx: EtfIndex | undefined,
  window: 'y3' | 'y5' | 'y10',
  refDate: string
): PctReliability | null {
  if (!idx) return null;
  const span = window === 'y10' ? 10 : window === 'y5' ? 5 : 3;
  const reasons: string[] = [];
  let level: 'high' | 'medium' | 'low' = 'high';

  if (idx.inceptionDate) {
    const age = YEARS(idx.inceptionDate, refDate);
    if (age < span) {
      level = 'low';
      const backfilled = Math.max(0, span - age);
      reasons.push(
        `指数 ${idx.inceptionDate} 才发布，${span} 年分位中约 ${backfilled.toFixed(1)} 年是回溯模拟，那段成分结构与现在不可比`
      );
    }
  }

  for (const c of idx.methodologyChanges ?? []) {
    const yearsAway = YEARS(c.date, refDate);
    if (Math.abs(yearsAway) <= 3) {
      if (level === 'high') level = 'medium';
      reasons.push(`${c.date} ${yearsAway >= 0 ? '已生效' : '将生效'}的编制变更：${c.summary}`);
    }
  }

  if (reasons.length === 0) {
    return { level: 'high', reason: `${span} 年分位样本完整，编制方法无近期变更` };
  }
  return { level, reason: reasons.join('；') };
}


export function etfThreeLayer(e: Etf, idx: EtfIndex | undefined, peers?: Etf[]): LayerResult[] {
  const out: LayerResult[] = [];
  const limit = premiumLimit(e);

  /* --- ① 成本层 --- */
  {
    let state: CheckState;
    let headline: string;
    const feeYears = premiumInFeeYears(e);
    const peer = peerFee(e, peers);
    if (e.premium == null) {
      state = 'partial';
      headline = '缺折溢价数据，成本无法验证';
    } else if (e.premium > limit) {
      state = 'fail';
      headline = `溢价 ${e.premium.toFixed(2)}%，超过 ${limit}% 容忍度${
        feeYears != null ? `，等于先付 ${feeYears.toFixed(1)} 年费率` : ''
      }`;
    } else if (e.fee.total == null) {
      state = 'partial';
      headline = `溢价 ${e.premium.toFixed(2)}% 在容忍度内，但费率未取得`;
    } else if (e.fee.total > ETF_FEE_MAX) {
      state = 'partial';
      headline = `溢价 ${e.premium.toFixed(2)}% 尚可，但费率 ${e.fee.total}% 偏高`;
    } else if (peer && e.fee.total - peer.min >= PEER_FEE_GAP && e.fee.total >= peer.min * PEER_FEE_RATIO) {
      /* 绝对费率合格，但同指数有更便宜的同款产品 */
      state = 'partial';
      headline = `溢价 ${e.premium.toFixed(2)}% 尚可，但费率 ${e.fee.total}% 是同指数最低 ${peer.min}% 的 ${peer.ratio.toFixed(1)} 倍`;
    } else {
      state = 'pass';
      headline = `溢价 ${e.premium.toFixed(2)}%，综合费率 ${e.fee.total}%`;
    }
    const peerText = peer
      ? `｜同指数 ${peer.count} 只可比产品中最低 ${peer.min}%/年（${peer.codes.join('、')}）${
          peer.ratio > 1 ? `，本只为其 ${peer.ratio.toFixed(1)} 倍` : '，本只即最低档'
        }`
      : '';
    out.push({
      layer: 1,
      name: '成本层：溢价 + 费率',
      state,
      headline,
      detail: `${e.premiumNote}｜费率：${e.fee.note}${peerText}`,
    });
  }

  /* --- ② 估值层 --- */
  {
    const p = indexPercentile(idx);
    let state: CheckState;
    let headline: string;
    let detail: string;
    if (!p) {
      state = 'fail';
      headline = '底层指数缺估值分位';
      detail = idx?.peCaveat ?? '未取得该指数的口径说明';
    } else {
      const rel = percentileReliability(idx, p.window, idx!.asOf);
      const tagText =
        rel && rel.level !== 'high' ? `（分位可信度${rel.level === 'low' ? '低' : '中'}）` : '';
      if (p.value <= 35) {
        /* 分位通过但样本不可比：只能算 partial。这不是「不知道」，是「知道它不可比」——
           两者在页面上必须区分，否则会把「样本有问题」当成「数据缺失」，用户会以为补上数据就能解决 */
        if (rel?.level === 'low') {
          state = 'partial';
          headline = `${idx!.name} ${p.basis} ${p.value.toFixed(0)} 通过，但分位样本不可比${tagText}`;
        } else {
          state = 'pass';
          headline = `${idx!.name} ${p.basis} ${p.value.toFixed(0)}，偏便宜${tagText}`;
        }
      } else if (p.value <= 65) {
        state = 'partial';
        headline = `${idx!.name} ${p.basis} ${p.value.toFixed(0)}，中性${tagText}`;
      } else {
        state = 'fail';
        headline = `${idx!.name} ${p.basis} ${p.value.toFixed(0)}，偏贵${tagText}`;
      }
      detail = [rel?.reason, idx?.peCaveat].filter(Boolean).join('｜');
    }
    out.push({
      layer: 2,
      name: '估值层：底层指数分位',
      state,
      headline,
      detail,
    });
  }

  /* --- ③ 可用层 --- */
  {
    let state: CheckState;
    let headline: string;
    if (e.subscription === 'suspended') {
      if (e.premium != null && e.premium > limit) {
        state = 'fail';
        headline = '申购关闭 + 溢价超容忍度：溢价失去套利回归机制';
      } else {
        state = 'partial';
        headline = '申购关闭，只能场内溢价成交';
      }
    } else if (e.subscription === 'limited') {
      state = 'partial';
      headline = '额度受限，能否按净值买入需逐日确认';
    } else if (e.turnover == null) {
      state = 'partial';
      headline = '可申赎，但流动性未取得';
    } else if (e.turnover < ETF_TURNOVER_MIN) {
      state = 'partial';
      headline = `日均成交 ${e.turnover} 亿，低于 ${ETF_TURNOVER_MIN} 亿，滑点风险`;
    } else {
      state = 'pass';
      headline = `正常申赎，日均成交 ${e.turnover} 亿`;
    }
    out.push({
      layer: 3,
      name: '可用层：申购状态 + 流动性',
      state,
      headline,
      detail: `${e.subscriptionNote}｜规模 ${e.scale == null ? '—' : e.scale + ' 亿'}${
        e.scaleAsOf ? `（${e.scaleAsOf}）` : ''
      }`,
    });
  }

  return out;
}

/**
 * ETF 状态派生：三层全过才「可配置」。
 * 关键区分：「缺数据」与「数据不合格」不是一回事。
 *   - 两项及以上明确 fail → 回避（例如高溢价 + 申购关闭，这是真实缺陷）
 *   - 只是数据没取到（partial）→ 需观察，并在页面标出「待核几项」
 * 不能因为「不知道」就判回避，那等于用缺失值做空头结论。
 * ETF 也不设「便宜但不买」——它的复合失败通常是「指数便宜但工具贵」，
 * 等溢价收敛即可，归入需观察。
 */
export function deriveEtfStatus(e: Etf, idx: EtfIndex | undefined, peers?: Etf[]): 'buy' | 'watch' | 'avoid' {
  const layers = etfThreeLayer(e, idx, peers);
  const passed = layers.filter((l) => l.state === 'pass').length;
  const failed = layers.filter((l) => l.state === 'fail').length;
  if (passed === 3) return 'buy';
  if (failed >= 2) return 'avoid';
  return 'watch';
}

/** 待核项数：partial 的层数。页面要给用户看到「这个结论有多结实」 */
export function etfPending(e: Etf, idx: EtfIndex | undefined, peers?: Etf[]): number {
  return etfThreeLayer(e, idx, peers).filter((l) => l.state === 'partial').length;
}
