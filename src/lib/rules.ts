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

/**
 * 一格分位数据。**窗口长度必须是数据的一部分，不能只写在字段名里。**
 *
 * 2026-11 审计：旧结构用 y10 / y20 命名，实际装的是
 * 美股近 45 年（96.3）、近 15 年（98.9）、恒指近 16 年（60）、日本窗口未披露（49）、
 * 印度 9.7（且与另一来源矛盾）。7 个市场里 4 个的 y10 不是 10 年。
 * 字段名比数据本身更自信，下游代码只认字段名——于是「窗口不可比」这个最大的
 * 误差来源，在整条判定链里完全不可见。
 */
export interface PctWindow {
  /** 窗口长度（年） */
  years: number;
  /** true = 长度是推断值，来源没有明示 */
  approx?: boolean;
  /** 分位，0-100，越高越贵 */
  value: number;
  /** 来源原话里的窗口描述 */
  label: string;
  source: string;
}

export interface PctMetric {
  windows: PctWindow[];
}

/** 数据硬伤。文本 caveat 机器读不懂，能影响判定的必须显式化 */
export type IntegrityFlag =
  | 'pb-missing'          // 只有 PB 分位、缺 PB 现值（无法用 ROE 复算背离）
  | 'metric-mismatch'     // 主指标不是 PE 而是 CAPE，与别市场的分位不同刻度
  | 'source-conflict'     // 同一指标有互相矛盾的来源，未裁决
  | 'method-break'        // 窗口内统计口径变过，前后不可比
  | 'window-undisclosed'  // 窗口长度未披露
  | 'erp-source-conflict' // ERP 用不同无风险利率会得出相反结论
  | 'stale';              // 估值数据超过陈旧阈值

export interface Market {
  id: string;
  name: string;
  indexName: string;
  region: string;
  flag: string;
  currency: string;
  level: number | null;
  levelAsOf: string | null;
  /** 估值数据自己的时点。origin 只有 levelAsOf，估值数据混用 6 个日期却无字段可查 */
  valuationAsOf?: string | null;
  valuation: {
    peTtm: number | null;
    pb: number | null;
    cape: number | null;
    dividendYield: number | null;
    peForward?: number | null;
    /** 前瞻 PB。与 TTM PB 不同口径（分母是预期净资产），不能与 pb 同列排名 */
    pbForward?: number | null;
  };
  /** 分位：0-100，越高越贵。每格都带自己的窗口长度 */
  percentiles: {
    pe?: PctMetric;
    pb?: PctMetric;
    cape?: PctMetric;
    /** 无长期分位时的参照说明 */
    note?: string;
    /** 数据硬伤，直接参与判定 */
    integrityFlags?: IntegrityFlag[];
  };
  rates: {
    riskFree: number | null;
    riskFreeLabel: string;
    /** 无风险利率自身的历史分位。缺它就无法判断 ERP 高是因为股票便宜还是利率低 */
    riskFreePercentile?: number | null;
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
  /** 指标类型：决定这个分位能不能和别的市场比大小 */
  kind: 'pe' | 'pb' | 'cape';
  /** 窗口长度（年）——结论必须带着它走 */
  years: number;
  approx: boolean;
  source: string;
  /** 来源原话里的窗口描述，如「2010 年以来（约 16 年）」 */
  windowLabel: string;
}

/* ------------------------------------------------------------
 * 主分位选择
 * ------------------------------------------------------------
 * 旧版顺序是 pe.y10 → pe.y5 → pe.y20 → pb.y10 → cape.y20 → cape.y10，
 * 两个指标内部的窗口排序互相矛盾（pe 里 y20 排最后，cape 里 y20 排最前），
 * 看不出是设计还是手滑。实际后果是美国用了 96.3（45 年）而不是 98.9（15 年）。
 *
 * 现在改成两条能讲清楚的规则：
 *   指标优先：PE（当期盈利，最直接）→ CAPE（长期平滑，适合指数）→ PB（受回购扭曲最大）
 *   窗口优先：同一指标里取最长窗口，因为短窗口的上界容易被上一轮泡沫抬高
 * ------------------------------------------------------------ */

export const KIND_LABEL: Record<'pe' | 'pb' | 'cape', string> = {
  pe: 'PE',
  pb: 'PB',
  cape: 'CAPE',
};

/**
 * 分位只在同一指标内部可比。
 * PE 与 CAPE 的分位分布不同（CAPE 用十年通胀调整平均盈利，序列更平滑、尾部更薄），
 * 把「美国 CAPE 96」和「日本 PE 49」放在一根尺上排大小，等于说美国贵一倍——
 * 这个比较在数学上没有意义。所以排序必须按 kind 分组，不能跨组比大小。
 */
const KIND_RANK: Record<'pe' | 'pb' | 'cape', number> = { pe: 0, cape: 1, pb: 2 };

function pickFromMetric(metric: PctMetric | undefined): PctWindow | null {
  const ws = metric?.windows;
  if (!ws?.length) return null;
  return [...ws].sort((a, b) => b.years - a.years)[0] ?? null;
}

/** 取"主分位"。返回 null 表示缺数据。 */
export function pickPrimaryPercentile(m: Market): Picked | null {
  const p = m.percentiles ?? {};
  for (const kind of ['pe', 'cape', 'pb'] as const) {
    const w = pickFromMetric(p[kind]);
    if (!w) continue;
    return {
      value: w.value,
      kind,
      years: w.years,
      approx: !!w.approx,
      source: w.source,
      windowLabel: w.label,
      basis: `${KIND_LABEL[kind]} 分位 ${w.value.toFixed(0)}（窗口 ${w.label}）`,
    };
  }
  return null;
}

/* ------------------------------------------------------------
 * 分位可信度：把「数据能不能支撑结论」变成独立维度
 * ------------------------------------------------------------
 * 旧版把 confidence 写进数据、显示在页面上，却不进任何 if 分支。
 * 结果印度（confidence: low）凭 9.7 分位拿到全站唯一的「极具性价比」，
 * 而它自己的 caveat 写着「来源冲突未裁决」「NSE 2021 改制使前后不可比」。
 * 这是全项目最讽刺的一处：一个专门表达「别太当真」的字段，
 * 唯一作用是让页面看起来更诚实。
 * ------------------------------------------------------------ */

export type Integrity = 'clean' | 'suspect' | 'broken';

export interface IntegrityReport {
  level: Integrity;
  /** 影响档位可信度的硬伤 */
  issues: string[];
  /** 只影响跨市场可比性的硬伤——读数本身可靠，但不能拿去比大小 */
  notices: string[];
  /** false = 不能与其它市场比大小（指标不同刻度，或关键现值缺失） */
  comparable: boolean;
  /** 被降级后封顶的档位说明 */
  cap?: string;
}

/** PE 分位与 PB 分位差多少点就必须提示。30 点是「两个指标开始说不同的话」的量级 */
export const METRIC_DIVERGENCE_GAP = 30;

/** 短于这个年数的分位不足以当作「长期分位」 */
export const MIN_WINDOW_YEARS = 10;

const FLAG_TEXT: Record<IntegrityFlag, string> = {
  'pb-missing': '缺 PB 现值，PE 与 PB 分位的背离无法用 ROE 复算',
  'metric-mismatch': '主指标是 CAPE 而非 PE，它的分位与别市场的 PE 分位不是同一把尺子',
  'source-conflict': '同一指标存在互相矛盾的来源读数，没有第三方裁决',
  'method-break': '统计口径在窗口内变过，前后不可直接比较',
  'window-undisclosed': '分位窗口长度未披露',
  'erp-source-conflict': 'ERP 换用另一套无风险利率会得出相反结论',
  stale: '估值数据已超出陈旧阈值',
};

/**
 * 三类硬伤，三种处理，不能混。
 *
 * 档位破坏型（source-conflict / method-break）：这格读数本身站不住，不能拿它下结论。
 * 可比性破坏型（metric-mismatch / pb-missing / erp-source-conflict）：
 *   读数可能很可靠，只是**不能拿去和别的市场比大小**。
 *   把美国 CAPE 96 分位因为「不可比」降成「偏贵」，是拿一个精度问题去削一个真实结论——
 *   它 150 年里只有 18 个月更贵，这个事实不该被「口径不同」抹平。
 * 存疑型（window-undisclosed）：窗口不知道多长，档位可信度打折但不能直接作废。
 */
const TIER_BREAKING: IntegrityFlag[] = ['source-conflict', 'method-break'];
const COMPARABILITY_BREAKING: IntegrityFlag[] = ['metric-mismatch', 'pb-missing', 'erp-source-conflict'];

export function percentileIntegrity(m: Market, pick?: Picked | null): IntegrityReport {
  const p = pick === undefined ? pickPrimaryPercentile(m) : pick;

  /* 没有分位就没有「分位可信度」这回事。档位已经是「数据不足」，
     再叠一句「证据不足」只是把同一个事实说两遍。 */
  if (!p) {
    return { level: 'clean', issues: [], notices: [], comparable: true };
  }

  const flags = m.percentiles?.integrityFlags ?? [];
  const issues: string[] = [];
  const notices: string[] = [];

  for (const f of flags) {
    if (f === 'stale') continue;
    if (COMPARABILITY_BREAKING.includes(f)) notices.push(FLAG_TEXT[f]);
    else issues.push(FLAG_TEXT[f]);
  }

  if (m.confidence === 'low') issues.push('置信度为低：来源之间尚未裁决，任何分位都不足以支撑方向');

  if (p.approx) issues.push(`窗口长度是推断值（${p.years} 年），不是来源明示`);
  if (p.years < MIN_WINDOW_YEARS) issues.push(`主分位窗口仅 ${p.years} 年，短窗口的上界容易被上一轮泡沫抬高`);

  // 背离检测：PE 与 PB 各自取最长窗口后比较
  const pe = pickFromMetric(m.percentiles?.pe);
  const pb = pickFromMetric(m.percentiles?.pb);
  if (pe && pb) {
    const gap = Math.abs(pe.value - pb.value);
    if (gap >= METRIC_DIVERGENCE_GAP) {
      issues.push(
        `PE 分位 ${pe.value.toFixed(0)} 与 PB 分位 ${pb.value.toFixed(0)} 差 ${gap.toFixed(
          0
        )} 个百分点：盈利端与净资产端给出相反的贵贱答案`
      );
    }
  }

  const broken = m.confidence === 'low' || flags.some((f) => TIER_BREAKING.includes(f));
  const level: Integrity = broken ? 'broken' : issues.length > 0 ? 'suspect' : 'clean';
  const comparable = !flags.some((f) => COMPARABILITY_BREAKING.includes(f));

  return {
    level,
    issues,
    notices,
    comparable,
    cap:
      level === 'broken'
        ? '证据链有硬缺口，不给方向'
        : level === 'suspect'
          ? '最高只到「偏便宜 / 偏贵」，不给「极具性价比 / 很贵」'
          : undefined,
  };
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
  /** 数据可信度，与档位正交：档位说「贵不贵」，可信度说「这句话能信几分」 */
  integrity: Integrity;
  integrityIssues: string[];
  /** 只说「不能比」的那类硬伤 */
  integrityNotices: string[];
  /** false = 不能与其它市场排在同一根尺上比大小 */
  comparable: boolean;
  /** 用于判定的那一格分位（含窗口长度），缺数据显示 null */
  basis: Picked | null;
  /** 档位是否被可信度封顶过 */
  capped: string | null;
}

/**
 * ERP 修正项的前置门槛。
 *
 * 2026-11 审计：ERP = 1/PE − 无风险利率。当无风险利率下行，ERP 会**自动**上升，
 * 与股票是否变便宜完全无关。而规则把「ERP ≥70 分位」读作股票便宜并上调一档——
 * 等于把债券端的变化记成了股票端的便宜。
 *
 * A 股就是实例：PE 69.2 分位（偏贵）经 ERP 71.6 分位修正后显示「合理」，
 * 但这个 ERP 的分母里 10Y 国债只有 1.62%。港股更直接，它自己的注释写着
 * 「若改用 10Y 美债，ERP 仅 4.15%（7 分位）——用哪个无风险利率，结论完全相反」，
 * 而规则正拿那个被自评为「完全相反」的读数单方面改档。
 *
 * 所以：只有拿到无风险利率自身的历史分位、且确认利率不在低位时，才允许 ERP 改档。
 * 拿不到就只提示、不改档——与「缺数据不给方向」是同一条原则。
 */
export const RISK_FREE_LOW_PCT = 45;

export function erpAdjustGate(m: Market): { allowed: boolean; why: string } {
  const rfp = m.rates?.riskFreePercentile;
  const rf = m.rates?.riskFree;
  if (typeof rfp !== 'number') {
    return {
      allowed: false,
      why: `无风险利率自身没有历史分位（当前 ${rf ?? '—'}%），无法区分 ERP 高是「股票便宜」还是「利率低」，因此不改档`,
    };
  }
  if (rfp <= RISK_FREE_LOW_PCT) {
    return {
      allowed: false,
      why: `无风险利率处于 ${rfp.toFixed(0)} 分位（偏低），ERP 里有相当一部分是利率下行给的，不是股票变便宜，不改档`,
    };
  }
  return { allowed: true, why: `无风险利率处于 ${rfp.toFixed(0)} 分位（不在低位），ERP 修正可用` };
}

/** suspect 封顶：拿掉两个极端档，只留「偏便宜 / 合理 / 偏贵」 */
const CAP_SUSPECT: Partial<Record<Tier, Tier>> = {
  'very-cheap': 'cheap',
  'very-rich': 'rich',
};

export function judge(m: Market): Verdict {
  const pick = pickPrimaryPercentile(m);
  const integ = percentileIntegrity(m, pick);

  if (!pick) {
    return {
      tier: 'unknown',
      label: TIER_LABEL.unknown,
      className: TIER_CLASS.unknown,
      reasons: ['缺少可用的长期估值分位，不做档位判断'],
      order: TIER_ORDER.indexOf('unknown'),
      integrity: integ.level,
      integrityIssues: integ.issues,
      integrityNotices: integ.notices,
      comparable: integ.comparable,
      basis: null,
      capped: null,
    };
  }

  const reasons: string[] = [];
  let idx = TIER_ORDER.indexOf(TIER_OF(pick.value));

  /* 证据链有硬缺口 → 直接不给方向，而不是给个弱方向。
     「说不清」和「偏便宜」是两个不同的答案，不能互相替代。
     注意措辞：不能先说「落在极具性价比」再说「不给方向」——那样等于把错误结论
     写进判定链，用户扫一眼只看到前半句。 */
  if (integ.level === 'broken') {
    reasons.push(
      `${pick.basis}，按数字会落在「${TIER_LABEL[TIER_ORDER[idx]]}」`
    );
    reasons.push(`但证据链有硬缺口（${integ.issues[0] ?? '数据不可信'}），这个档位不成立，不给方向`);
    return {
      tier: 'unknown',
      label: '说不清',
      className: TIER_CLASS.unknown,
      reasons,
      order: TIER_ORDER.indexOf('unknown'),
      integrity: integ.level,
      integrityIssues: integ.issues,
      integrityNotices: integ.notices,
      comparable: integ.comparable,
      basis: pick,
      capped: '证据链有硬缺口，不给方向',
    };
  }

  reasons.push(`${pick.basis} → 落在「${TIER_LABEL[TIER_ORDER[idx]]}」`);

  /* --- ERP 修正：带前置门槛 --- */
  const erpPct = m.rates.erpPercentile;
  if (typeof erpPct === 'number') {
    const gate = erpAdjustGate(m);
    if (!gate.allowed) {
      reasons.push(`ERP ${erpPct.toFixed(0)} 分位，但${gate.why}`);
    } else if (erpPct >= 70 && idx > 0) {
      idx -= 1;
      reasons.push(`ERP 处于 ${erpPct.toFixed(0)} 分位（股票相对债券便宜）且${gate.why}，上调一档`);
    } else if (erpPct <= 30 && idx < TIER_ORDER.indexOf('very-rich')) {
      idx += 1;
      reasons.push(`ERP 处于 ${erpPct.toFixed(0)} 分位（股票相对债券贵）且${gate.why}，下调一档`);
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

  /* --- 可信度封顶 --- */
  let capped: string | null = null;
  if (integ.level === 'suspect') {
    const after = CAP_SUSPECT[TIER_ORDER[idx]];
    if (after) {
      capped = `原判「${TIER_LABEL[TIER_ORDER[idx]]}」，因${integ.issues[0] ?? '数据存疑'}封顶为「${TIER_LABEL[after]}」`;
      idx = TIER_ORDER.indexOf(after);
      reasons.push(capped);
    }
  }

  const tier = TIER_ORDER[idx];
  return {
    tier,
    label: TIER_LABEL[tier],
    className: TIER_CLASS[tier],
    reasons,
    order: idx,
    integrity: integ.level,
    integrityIssues: integ.issues,
    integrityNotices: integ.notices,
    comparable: integ.comparable,
    basis: pick,
    capped,
  };
}

/**
 * 跨市场排序键。
 * 关键点：不同指标的分位不可比，所以先按档位、再按**指标类型分组**，组内才比大小。
 * 不能直接拿 96（CAPE）和 49（PE）比出「美国贵一倍」——那个比较在数学上没有意义。
 * 不可比的市场（comparable=false）排在同档位内、同 kind 组的后面，但仍留在自己的组里。
 */
export function marketSortKey(v: Verdict): [number, number, number, number] {
  return [
    v.order,
    v.basis ? KIND_RANK[v.basis.kind] : 9,
    v.comparable ? 0 : 1,
    v.basis ? v.basis.value : 999,
  ];
}

/** 估值快照超过这么多天就标 stale。市场的估值数据比 ETF 变化慢，但也不能无限期挂着 */
export const MARKET_DATA_STALE_DAYS = 60;

export const INTEGRITY_LABEL: Record<Integrity, string> = {
  clean: '口径干净',
  suspect: '口径存疑',
  broken: '证据不足',
};

/* ------------------------------------------------------------
 * 绝对估值横向定位
 * ------------------------------------------------------------
 * 2026-11 深度调研发现一个结构性问题：长期分位的可得性极不均匀。
 * 9 个市场里只有 5 个能拿到可信的长期分位（美/中/港/日/印），
 * 英、德、越、韩 全部只有当期 PE/PB，没有分位序列——于是它们只能判「数据不足」。
 * 结果 6/9 没有方向，面板失去区分度。
 *
 * 但「没有分位」不等于「没有信息」。当期 PE 14.86 与 18.82 的高低是客观事实，
 * 只是它回答的问题不同：
 *   分位      → 「这个市场相对它自己的历史，现在贵不贵」（纵向）
 *   绝对水平  → 「这个市场相对其它市场，现在贵不贵」（横向）
 * 两者都回答「贵不贵」，但参照系不同，不能互相替代，也不能合成一个分数。
 *
 * 所以这里只做**事实陈述**：在所有有该指标的市场里排第几。
 * 排名不含判断，判断留给 analystView——因为「PE 低」既可能是便宜，
 * 也可能是结构性折价（富时 100 的科技权重只有 1%）。
 * ------------------------------------------------------------ */

export interface PeerPosition {
  metric: 'pe' | 'pb' | 'dividendYield' | 'cape' | 'peForward';
  label: string;
  value: number;
  /** 排名，1 = 最便宜。PE/PB/CAPE 越低越便宜；股息率越高越便宜 */
  rank: number;
  total: number;
  /** true = 这个指标越高越便宜（只有股息率是） */
  inverted: boolean;
}

const POSITION_METRICS: Array<{ key: PeerPosition['metric']; label: string; inverted: boolean }> = [
  { key: 'pe', label: 'PE (TTM)', inverted: false },
  { key: 'pb', label: 'PB', inverted: false },
  { key: 'cape', label: 'CAPE', inverted: false },
  { key: 'peForward', label: '前向 PE', inverted: false },
  { key: 'dividendYield', label: '股息率', inverted: true },
];

function readMetric(m: Market, key: PeerPosition['metric']): number | null {
  if (key === 'cape') return m.valuation.cape;
  if (key === 'peForward') return m.valuation.peForward ?? null;
  if (key === 'pe') return m.valuation.peTtm;
  if (key === 'pb') return m.valuation.pb;
  return m.valuation.dividendYield;
}

/**
 * 每个市场在每个指标上「排第几」。含缺失值的市场不参与该指标的排名，
 * 但 total 会随指标变化——所以页面必须显示 n/N，否则「第 3」看不出分母。
 */
export function absolutePositions(markets: Market[]): Map<string, PeerPosition[]> {
  const out = new Map<string, PeerPosition[]>();

  for (const def of POSITION_METRICS) {
    const pool = markets
      .map((m) => ({ id: m.id, v: readMetric(m, def.key) }))
      .filter((x): x is { id: string; v: number } => typeof x.v === 'number' && Number.isFinite(x.v));
    if (pool.length < 3) continue;

    const sorted = [...pool].sort((a, b) => (def.inverted ? b.v - a.v : a.v - b.v));
    sorted.forEach((row, i) => {
      const list = out.get(row.id) ?? [];
      list.push({
        metric: def.key,
        label: def.label,
        value: row.v,
        rank: i + 1,
        total: pool.length,
        inverted: def.inverted,
      });
      out.set(row.id, list);
    });
  }

  return out;
}

/** 排名转成人话 */
export function positionHint(p: PeerPosition): string {
  const ratio = p.rank / p.total;
  if (p.total < 4) return `第 ${p.rank}/${p.total}`;
  if (ratio <= 0.25) return `最便宜的一档（第 ${p.rank}/${p.total}）`;
  if (ratio <= 0.5) return `偏低（第 ${p.rank}/${p.total}）`;
  if (ratio <= 0.75) return `偏高（第 ${p.rank}/${p.total}）`;
  return `最贵的一档（第 ${p.rank}/${p.total}）`;
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
  /**
   * 同一天的另一个 PE 读数（不同机构/不同口径）。2026-11 加电力指数时才发现必须留这个口子：
   * iFinD 整体法给 22.43（十年分位 73%），Wind 剔除亏损样本给 17.75（五年分位 25.84%）。
   * 两个数都「对」，但它们指向相反的结论。只存一个，等于把分歧藏起来。
   */
  peAlt?: {
    value: number;
    source: string;
    asOf?: string;
    pct5y?: number;
    note?: string;
  } | null;
  peCaveat?: string;
  /**
   * 周期性标记。2026-11 加航运时发现规则有个方向性错误：
   * 对强周期行业，PE 分位是**反向指标**——盈利在顶部时 PE 低（分母大），
   * 盈利在底部时 PE 高（分母小）。拿它判「便宜」等于在周期顶部买入。
   * 现有 entryAssessment 对这一点毫无防备，因为前面 10 个指数里没有一个是强周期。
   */
  cyclical?: {
    level: 'strong' | 'moderate' | 'none';
    /** 驱动变量，如「BDI 干散货运价」「集运运价 SCFI」 */
    driver: string;
    /** 该指数中受驱动影响的权重（%）。35% 的权重意味着 65% 的涨跌与运价无关 */
    driverWeight?: number | null;
    /** 正常化 ROE（%）：跨完整周期的中枢，不是当期读数 */
    normalizedRoe?: number | null;
    note?: string;
  } | null;
  /**
   * 周期位置快照。判断「现在在哪」比判断「贵不贵」更重要：
   * 同一只指数在周期顶部和底部的合理 PB 可以差一倍。
   */
  cycle?: {
    indicator: string;
    value: number;
    unit: string;
    asOf: string;
    range52w?: [number, number] | null;
    /** 年初至今涨跌幅（%） */
    ytd?: number | null;
    /** 近一月涨跌幅（%） */
    mom?: number | null;
    zone: 'peak' | 'high' | 'mid' | 'low' | 'trough';
    note?: string;
  } | null;
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

type PctWindow = 'y3' | 'y5' | 'y10';
type PctPick = { value: number; basis: string; window: PctWindow };

/** 从一组分位里挑主分位：10 年 → 5 年 → 3 年。PE 与 PB 共用这一把尺子 */
function pickPercentile(set: EtfIndex['pePct'] | undefined, prefix: 'PE' | 'PB'): PctPick | null {
  if (!set) return null;
  const order: Array<[PctWindow, string]> = [
    ['y10', `${prefix} 10 年分位`],
    ['y5', `${prefix} 5 年分位`],
    ['y3', `${prefix} 3 年分位`],
  ];
  for (const [w, label] of order) {
    const v = set[w];
    if (typeof v === 'number') return { value: v, basis: label, window: w };
  }
  return null;
}

/** 底层指数的主分位：PE 10 年优先，其次 5 年、3 年 */
export function indexPercentile(idx: EtfIndex | undefined): PctPick | null {
  return pickPercentile(idx?.pePct, 'PE');
}

/** PB 分位。只在 PE 不可用时作为替代证据，不能和 PE 分位同时当「两条证据」用 */
export function pbPercentile(idx: EtfIndex | undefined): PctPick | null {
  return pickPercentile(idx?.pbPct, 'PB');
}

export interface ValuationEvidence extends PctPick {
  kind: 'pe' | 'pb';
  /** 为什么不用 PE（kind='pb' 时必填） */
  fallbackReason?: string;
  /** ROE ≤ 0：便宜的是净资产，而净资产正在被亏损吃掉 */
  equityErosion?: string;
}

/**
 * 估值层到底拿哪把尺子量——这是 2026-11 加光伏时发现的漏洞。
 *
 * 故障场景：中证光伏产业（931151）整体法 PE 是 -65.91。分位照样算得出来（13.90%），
 * 因为把一堆负数排序也能排出百分位。于是旧规则会输出「PE 10 年分位 14，偏便宜」——
 * 一个完全由「亏得有多深」决定的名次，被当成了估值证据。指数越亏，PE 越负，
 * 排名反而可能越靠前，结论会随亏损扩大而变得「更便宜」，方向是反的。
 *
 * 所以定一条硬规则：PE ≤ 0 时 PE 分位失效，改用 PB 分位，并且**最多只算部分通过**。
 * 理由是 PB 处在低位只说明「资产被折价」，而指数整体亏损时，PB 的分母（净资产）
 * 恰恰在缩水——今天 1.71 倍 PB 对应的净资产，明年可能少掉一块，PB 会自动「变贵」。
 * 这种便宜无法用「等它涨回来」来兑现，除非盈利先转正。
 */
export function indexValuation(idx: EtfIndex | undefined): ValuationEvidence | null {
  if (!idx) return null;

  const peUsable = typeof idx.pe === 'number' && idx.pe > 0;
  if (peUsable) {
    const p = indexPercentile(idx);
    return p ? { ...p, kind: 'pe' } : null;
  }

  const pb = pbPercentile(idx);
  if (!pb) return null;

  const fallbackReason =
    typeof idx.pe === 'number'
      ? `PE 为 ${idx.pe}（指数整体亏损）：PE 分位只是把负数排序，名次由「亏多亏少」决定，不能当估值证据，本层改用 PB`
      : '未取得 PE，本层改用 PB';

  const equityErosion =
    typeof idx.roe === 'number' && idx.roe <= 0
      ? `ROE ${idx.roe}%：净资产本身在缩水，PB 的分母还在变小。低 PB 不等于资产打折，也可能只是亏损还没把净资产吃完`
      : undefined;

  return { ...pb, kind: 'pb', fallbackReason, equityErosion };
}

export interface PctReliability {
  level: 'high' | 'medium' | 'low';
  reason: string;
}

type PctSet = { y3?: number; y5?: number; y10?: number };

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

export interface WindowConflict {
  long: { window: 'y10' | 'y5'; label: string; value: number };
  short: { window: 'y3'; label: string; value: number };
  gap: number;
  kind: 'pe' | 'pb';
  reason: string;
}

/**
 * 分位窗口分歧——2026-11 看白酒时发现的第三类「分位不可信」。
 *
 * percentileReliability 处理的是「样本不可比」（回溯模拟、编制变更）。还有一类更隐蔽：
 * **样本可比，长窗口却已失去可比性——因为它套住了一个极端泡沫。**
 *
 * 中证酒（399987）2026-11-13：PE 十年分位 25.08（看着便宜）、三年分位 76.59（近三年最贵）。
 * 两个数字都对，矛盾出在 2021 年那一轮：白酒 PE 被推到 50–60 倍，把十年窗口的上界
 * 抬到了一个大概不会再回去的位置。分母被抬高，今天的 22 倍自然显得「只有历史四分之一」。
 * 但对 2023 年以后才进场的人，这段历史里从没有过 22 倍以下——三年分位 76.59 才是他
 * 亲身经历的「贵」。
 *
 * 所以规则：长窗口 ≤35 且短窗口 ≥65 时判为分歧，估值层不得判通过。
 * 这不是数据有错，是「拿哪一段当锚」的选择——而选择本身决定结论，
 * 就不能再假装它是一个客观分位。
 */
export function percentileWindowConflict(idx: EtfIndex | undefined): WindowConflict | null {
  if (!idx) return null;

  const check = (
    set: Partial<Record<'y3' | 'y5' | 'y10', number>> | undefined,
    kind: 'pe' | 'pb'
  ): WindowConflict | null => {
    if (!set) return null;
    const longW = typeof set.y10 === 'number' ? 'y10' : typeof set.y5 === 'number' ? 'y5' : null;
    if (!longW) return null;
    const longV = set[longW] as number;
    const shortV = set.y3;
    if (typeof shortV !== 'number') return null;
    if (!(longV <= 35 && shortV >= 65)) return null;
    const longLabel = longW === 'y10' ? '十年' : '五年';
    return {
      long: { window: longW, label: longLabel, value: longV },
      short: { window: 'y3', label: '三年', value: shortV },
      gap: shortV - longV,
      kind,
      reason: `${longLabel}分位 ${longV.toFixed(0)} 与三年分位 ${shortV.toFixed(
        0
      )} 方向相反、差 ${(shortV - longV).toFixed(
        0
      )} 个百分点：长窗口的上界被上一轮泡沫里的极端估值抬高了，分位低是分母效应，不是这件东西变便宜了`,
    };
  };

  return check(idx.pePct as PctSet, 'pe') ?? check(idx.pbPct as PctSet, 'pb');
}

/**
 * 隐含派息率 = 股息率 × PE。
 *
 * 股息率 = 派息率 ÷ PE 是恒等式，反过来就能从两个已知数里把派息率解出来。
 * 这有什么用？——高股息叙事最常见的漏洞是「分子滞后于分母」：
 * 股息率 TTM 的分子是过去 12 个月**实际派发**的现金（按上一年的利润定的），
 * 分母是当前股价；而 PE TTM 的分母是最近四个季度**已经下滑**的净利润。
 * 利润先跌，分红后跌，两者时点错配，于是股息率被虚高。
 *
 * 中证酒：股息率 4.15%、PE 22.26 → 隐含派息率 92.4%。
 * 一家公司可以把 90% 的利润分掉，一个行业长期如此是不现实的——那等于不再投入。
 * 真实的头部酒企派息率在 65–80%，说明 4.15% 里有一块是「用旧利润派、按新价格算」
 * 的时点差。所以绝对锚（股息率 − 国债 ≥ 2pct）在这里只能算「看起来过了」，
 * 不能当作「可持续的现金回报」。
 */
export function impliedPayoutRatio(idx: EtfIndex | undefined): number | null {
  if (!idx) return null;
  const { dividendYield: dy, pe } = idx;
  if (typeof dy !== 'number' || typeof pe !== 'number' || pe <= 0) return null;
  return dy * pe;
}

/** 派息率超过这个水平，股息率就难以持续——分红吃掉利润的同时也吃掉了再投入 */
export const PAYOUT_CEILING = 80;

/** 同一个 PE 的两个来源差多少就算「说不清」。20% 是同口径的正常波动上限 */
export const PE_SOURCE_GAP = 0.2;

export interface PeSourceConflict {
  main: number;
  alt: number;
  /** 相对偏离（|alt - main| / main） */
  gap: number;
  source: string;
  reason: string;
}

/**
 * PE 来源分歧——2026-11 加电力指数时发现。
 *
 * 光伏那次是「-65.91 对 22.54」，差 88 倍，一眼就知道口径不同（一个含亏损样本、一个剔除）。
 * 电力这次更阴险：22.43 对 17.75，差 26%。两个数都像是正常市盈率，看不出谁错，
 * 但它们各自的分位是 73%（偏贵）和 25.84%（便宜）——**结论相反**。
 *
 * 差的来源是分母里有没有亏损机组：电力指数 59 只样本里，火电在煤价高位时有亏损公司。
 * 整体法把亏损公司算进分母，行业利润变小，PE 就高；剔除亏损只统计赚钱的公司，PE 就低。
 * 前者回答「整个行业按利润算回本要几年」，后者回答「赚钱的那部分回本要几年」。
 *
 * 所以规则：两个来源差超过 PE_SOURCE_GAP 时，估值层最高只判部分通过——
 * 不是「贵」，是「这件事本身还没法下结论」。给出一个数比给出两个数更需要理由。
 */
export function peSourceConflict(idx: EtfIndex | undefined): PeSourceConflict | null {
  if (!idx || typeof idx.pe !== 'number' || idx.pe <= 0) return null;
  const alt = idx.peAlt?.value;
  if (typeof alt !== 'number' || alt <= 0) return null;
  const gap = Math.abs(alt - idx.pe) / idx.pe;
  if (gap < PE_SOURCE_GAP) return null;
  return {
    main: idx.pe,
    alt,
    gap,
    source: idx.peAlt?.source ?? '另一来源',
    reason: `同日两个口径的 PE 是 ${idx.pe} 与 ${alt}，差 ${(gap * 100).toFixed(
      0
    )}%：整体法把亏损样本算进分母，剔除亏损口径只统计还在赚钱的公司。前者回答「整个行业按利润回本要几年」，后者回答「赚钱的那部分要几年」——两个都对，但会得出相反的贵贱结论`,
  };
}

/* ============================================================
 * 指标背离：PE 分位与 PB 分位说不同的话
 * ------------------------------------------------------------
 * 2026-11 审计用户指出的问题：「ETF 说纳斯达克 100 便宜，全球市场说美股贵」。
 *
 * 两个数都对：
 *   - 纳指 PE 27.08、10 年分位 28 → 相对过去十年，现在比大多数时候便宜
 *   - 美股 CAPE 40.71、45 年分位 96.3 → 相对过去 45 年，现在几乎是最贵
 * 但纳指自己的 pbPct 是 88.4 分位（很贵），而 entryAssessment 只读了 PE，
 * PB 那个 88.4 一个字没看——于是给出了「偏便宜」，和自己的 caveat 直接冲突。
 * 它的 caveat 原文：「PE 分位 28% 与 PB 分位 88% 的背离无法用 ROE 复算……
 * 在补齐 PB 之前不作结论」。
 *
 * 背离本身不是错误，它有明确含义：PB = PE × ROE。
 *   ROE 上升 → 分母（净资产）相对利润变小 → PB 升、PE 降。
 *   所以「PE 便宜 + PB 贵」= 高 ROE / 高回购，不等于便宜，也不等于贵。
 *
 * 判定分三种：
 *   ROE 能复算且吻合 → 背离由 ROE 解释，不加 block，但必须写明（否则用户以为 PE 分位就是全部）
 *   ROE 能复算但不吻合 → 真背离，不加方向
 *   缺 PB 现值或缺 ROE → 无法归因，不加方向（纳指属于这种）
 * ============================================================ */

/** ETF 侧的背离阈值。40 点是两把尺子量出相反答案的量级（市场侧用 30，因为那边只有两格可见） */
export const ETF_DIVERGENCE_GAP = 40;

/** ROE 复算的容差：|PE×ROE − PB| / PB 超过 10% 就算复算不上 */
export const ROE_RECON_TOL = 0.1;

export interface MetricDivergence {
  pePct: number;
  pbPct: number;
  gap: number;
  /** true = ROE 能解释这个背离；false = 解释了但不算；null = 缺 PB 现值或 ROE，无法归因 */
  explainedByRoe: boolean | null;
  /** 复算出来的隐含 PB，用于展示 */
  impliedPb: number | null;
  reason: string;
}

export function metricDivergence(idx: EtfIndex | undefined): MetricDivergence | null {
  if (!idx) return null;
  const pePct = idx.pePct?.y10;
  const pbPct = idx.pbPct?.y10;
  if (typeof pePct !== 'number' || typeof pbPct !== 'number') return null;
  const gap = Math.abs(pbPct - pePct);
  if (gap < ETF_DIVERGENCE_GAP) return null;

  let explainedByRoe: boolean | null = null;
  let impliedPb: number | null = null;

  if (typeof idx.pb === 'number' && typeof idx.roe === 'number' && typeof idx.pe === 'number' && idx.pe > 0) {
    impliedPb = (idx.pe * idx.roe) / 100;
    explainedByRoe = Math.abs(impliedPb - idx.pb) / idx.pb <= ROE_RECON_TOL;
  }

  const base = `PB 分位 ${pbPct.toFixed(0)} 与 PE 分位 ${pePct.toFixed(0)} 差 ${gap.toFixed(0)} 点`;
  let reason: string;
  if (explainedByRoe === true) {
    reason = `${base}：这是 ROE ${idx.roe}% 造成的（PE×ROE = ${impliedPb!.toFixed(
      2
    )} ≈ PB ${idx.pb}），同一件事的两个侧面，不是矛盾`;
  } else if (explainedByRoe === false) {
    reason = `${base}，而 ROE ${idx.roe}% 复算出的 PB 应为 ${impliedPb!.toFixed(
      2
    )}、实际 ${idx.pb}，对不上——盈利端与净资产端给出相反的贵贱答案`;
  } else {
    reason = `${base}，但缺${typeof idx.pb !== 'number' ? ' PB 现值' : ''}${
      typeof idx.roe !== 'number' ? `${typeof idx.pb !== 'number' ? '、' : ''}ROE` : ''
    }，无法确认这个背离是 ROE 抬升造成的还是估值本身在打架`;
  }

  return { pePct, pbPct, gap, explainedByRoe, impliedPb, reason };
}

/* ============================================================
 * 两维模型：工具分 / 入场分
 * ------------------------------------------------------------
 * 2026-11 审计发现旧的三层模型有一个结构性缺陷：它把三件不同的事
 * （这个 beta 要不要、现在是不是时候、买哪只工具）AND 成了一个状态词。
 * 结果 25 只里 22 只判「需观察」，而同样是「需观察」，
 * 510300（1870 亿、0.20%、成交 34.89 亿，全表工具最好）与
 * 561560（成交 0.42 亿、费率是最低档 3 倍）显示同一个词——用户要做相反的动作。
 *
 * 更严重的是「可配置」被指数层锁死：估值层判的是指数，同指数下所有 ETF
 * 共享同一结论，所以只要指数贵或说不清，工具再好也永远不可能可配置。
 * 于是「可配置」衡量的是「哪个指数便宜」，不是「哪只 ETF 好」。
 *
 * 拆开之后：
 *   工具分（只在同指数内比较）→ 回答了「买哪只」：同类最优 / 竞争档 / 落后
 *   入场分（指数自身属性）    → 回答了「现在买不买」：便宜 / 中性 / 偏贵 / 说不清
 * 两者正交，组合出六个动作，每个动作对应一句能执行的话。
 * ============================================================ */

export type ToolGrade = 'first' | 'competitive' | 'lagging';
export type FeeRank = 'min' | 'near' | 'high' | 'only' | 'unknown';
export type LiqState = 'ok' | 'thin' | 'unknown';
export type CostState = 'ok' | 'high' | 'unknown';
export type EntryGrade = 'cheap' | 'fair' | 'expensive' | 'unclear';
export type EtfAction = 'buy' | 'switch' | 'wait' | 'skip' | 'avoid' | 'probe';

export const ACTION_LABEL: Record<EtfAction, string> = {
  buy: '可配置',
  switch: '换工具',
  wait: '等时机',
  skip: '不参与',
  avoid: '回避',
  probe: '待核',
};

export const ACTION_HINT: Record<EtfAction, string> = {
  buy: '工具是同类最优，指数也不贵——两件事同时成立，可以执行',
  switch: '指数已经到位，但这只不是同指数最优——换一只立刻能做，不用等',
  wait: '工具选对了，时机没到——挂着等指数，不需要换产品',
  skip: '两头都不占：工具不是最优，指数也不便宜或说不清',
  avoid: '工具本身有硬伤（溢价无法回归），与指数贵贱无关',
  probe: '决定能不能买的那项数据没拿到——风险未知，不等于风险可控',
};

export const ACTION_TONE: Record<EtfAction, string> = {
  buy: 'cheap',
  switch: 'accent',
  wait: 'fair',
  skip: 'dim',
  avoid: 'expensive',
  probe: 'unknown',
};

export const TOOL_LABEL: Record<ToolGrade, string> = {
  first: '同类最优',
  competitive: '竞争档',
  lagging: '落后',
};

export const ENTRY_LABEL: Record<EntryGrade, string> = {
  cheap: '便宜',
  fair: '中性',
  expensive: '偏贵',
  unclear: '说不清',
};

const TOOL_ORDER: Record<ToolGrade, number> = { first: 0, competitive: 1, lagging: 2 };

/** 规模/成交数据超过这么多天就算陈旧——陈旧和缺失的风险是一样的，都不能当合格用 */
export const ETF_DATA_STALE_DAYS = 60;

const daysBetween = (from: string, to: string) =>
  (new Date(to).getTime() - new Date(from).getTime()) / 864e5;

function feeRankOf(e: Etf, peer: ReturnType<typeof peerFee>): FeeRank {
  const total = e.fee?.total ?? null;
  if (total == null) return 'unknown';
  if (total > ETF_FEE_MAX) return 'high';
  if (!peer) return 'only';
  if (Math.abs(total - peer.min) < 1e-9) return 'min';
  if (total - peer.min >= PEER_FEE_GAP && total >= peer.min * PEER_FEE_RATIO) return 'high';
  return 'near';
}

function liqOf(e: Etf, refDate?: string): LiqState {
  if (e.turnover == null) return 'unknown';
  if (refDate && e.turnoverAsOf && daysBetween(e.turnoverAsOf, refDate) > ETF_DATA_STALE_DAYS) {
    return 'unknown';
  }
  return e.turnover < ETF_TURNOVER_MIN ? 'thin' : 'ok';
}

function gradeOf(e: Etf, peer: ReturnType<typeof peerFee>, refDate?: string): ToolGrade {
  const fr = feeRankOf(e, peer);
  const liq = liqOf(e, refDate);
  /* 费率落后或流动性不足，任一条就够判落后：这两项都是「每年/每次都付」的损耗 */
  if (fr === 'high' || liq === 'thin') return 'lagging';
  /* 费率未知不等于合格，但也不该直接算落后——归入竞争档，由动作层强制待核 */
  if (fr === 'unknown') return 'competitive';
  if (liq === 'unknown') return 'competitive';
  if (fr === 'min' || fr === 'only') return 'first';
  return 'competitive';
}

export interface ToolAssessment {
  grade: ToolGrade;
  feeRank: FeeRank;
  liq: LiqState;
  peers: ReturnType<typeof peerFee>;
  /** 同指数内更有资格被买的产品（同类最优里费率最低、流动性最好的那只），用于「换工具」 */
  betterAlternative: string | null;
  rank: number;
  total: number;
  headline: string;
  notes: string[];
}

/** 同指数内的工具排名：先按档位，再按费率升序、成交额降序。字典序，不是加权求和 */
export function toolRanking(e: Etf, peers?: Etf[], refDate?: string): Etf[] {
  const pool = (peers ?? [e]).filter((p) => p.indexId === e.indexId);
  if (!pool.some((p) => p.code === e.code)) pool.push(e);
  return [...pool].sort((a, b) => {
    const ga = gradeOf(a, peerFee(a, pool), refDate);
    const gb = gradeOf(b, peerFee(b, pool), refDate);
    if (TOOL_ORDER[ga] !== TOOL_ORDER[gb]) return TOOL_ORDER[ga] - TOOL_ORDER[gb];
    const fa = a.fee.total ?? 99;
    const fb = b.fee.total ?? 99;
    if (fa !== fb) return fa - fb;
    return (b.turnover ?? 0) - (a.turnover ?? 0);
  });
}

export function toolAssessment(e: Etf, peers?: Etf[], refDate?: string): ToolAssessment {
  const pool = (peers ?? [e]).filter((p) => p.indexId === e.indexId);
  if (!pool.some((p) => p.code === e.code)) pool.push(e);
  const peer = peerFee(e, pool);
  const fr = feeRankOf(e, peer);
  const liq = liqOf(e, refDate);
  const grade = gradeOf(e, peer, refDate);
  const ordered = toolRanking(e, pool, refDate);
  const rank = ordered.findIndex((p) => p.code === e.code) + 1;
  const better = ordered.find((p) => p.code !== e.code && gradeOf(p, peerFee(p, pool), refDate) === 'first');

  const notes: string[] = [];
  if (fr === 'only') notes.push(`同指数只有 ${pool.length} 只产品，费率没有同类可比——通过不是因为便宜，是因为别无选择`);
  if (fr === 'unknown') notes.push('费率未取得，无法与同类比较');
  if (liq === 'unknown') notes.push('日均成交未取得或已陈旧，流动性无法验证');
  if (liq === 'thin' && fr === 'min') notes.push('费率是最低档，但成交额低于下限——省下的年费可能被滑点吃回去');

  let headline: string;
  if (grade === 'first') {
    headline =
      fr === 'only'
        ? `费率 ${e.fee.total ?? '—'}%（同指数仅此一只），日均成交 ${e.turnover ?? '—'} 亿`
        : `费率 ${e.fee.total}% 是同指数最低档，日均成交 ${e.turnover ?? '—'} 亿`;
  } else if (grade === 'competitive') {
    headline =
      fr === 'unknown'
        ? `费率未取得，成交 ${e.turnover ?? '—'} 亿——无法判断是否落后`
        : `费率 ${e.fee.total}%，高于同指数最低 ${peer?.min}% 但差距未达相对锚，成交 ${e.turnover ?? '—'} 亿`;
  } else {
    if (fr === 'high' && liq === 'thin') {
      headline = `费率 ${e.fee.total}% 是同指数最低 ${peer?.min}% 的 ${peer?.ratio.toFixed(1)} 倍，成交仅 ${e.turnover} 亿`;
    } else if (fr === 'high') {
      headline = `费率 ${e.fee.total}% 是同指数最低 ${peer?.min}% 的 ${peer?.ratio.toFixed(1)} 倍`;
    } else if (pool.length === 1) {
      /* 同一指数只有这一只时，「落后」不是比较出来的，是绝对水平不合格。
         2026-11 加航运时发现：516910 是同类唯一产品，却因为成交 0.19 亿被判
         「落后同类」——它没有同类。真实含义是「这个赛道没有合格的现成工具」。 */
      headline = `同指数仅此一只，但日均成交 ${e.turnover ?? '—'} 亿低于 ${ETF_TURNOVER_MIN} 亿下限——这个赛道没有合格的现成工具`;
    } else {
      headline =
        rank === 1
          ? `日均成交 ${e.turnover} 亿，低于 ${ETF_TURNOVER_MIN} 亿下限——同类第 1/${ordered.length}，但绝对水平不合格`
          : `日均成交 ${e.turnover} 亿，低于 ${ETF_TURNOVER_MIN} 亿下限，同类第 ${rank}/${ordered.length}`;
    }
  }

  return {
    grade,
    feeRank: fr,
    liq,
    peers: peer,
    betterAlternative: better?.code ?? null,
    rank,
    total: ordered.length,
    headline,
    notes,
  };
}

/* ============================================================
 * 周期股守卫
 * ------------------------------------------------------------
 * entryAssessment 用分位判贵贱，这个逻辑对稳定行业成立：估值区间在十年里
 * 围绕中枢波动，偏离即回归。强周期行业不成立。
 *
 * 以 2026 年 11 月的航运为例：BDI 年初至今 +108.8%、VLCC 中东-中国航线
 * 日收益 128.6 万美元，而中远海控 PE(TTM) 只有 7.52 倍——因为分母是周期
 * 顶部的盈利。低 PE 不代表便宜，代表「这次盈利不可持续」。反过来在 2023 年
 * 集运低谷，中远海控 PE(TTM) 曾超过 40 倍，高 PE 也不代表贵。
 *
 * 所以对强周期行业：
 *   ① PE 分位只在周期中段才有判读力；
 *   ② 周期高位 + PE 低 → 不得判便宜（那是顶部盈利的镜子）；
 *   ③ 周期低位 + PE 高 → 不得判贵；
 *   ④ PB-ROE 反推必须用正常化 ROE，不能用当期 ROE。
 * ============================================================ */

export interface CycleGuard {
  triggered: boolean;
  kind: 'peak-pe-low' | 'trough-pe-high' | null;
  reasons: string[];
  /** 正常化 ROE 下的 PB-ROE 反推 */
  normalized: {
    roeUsed: number;
    roeSource: '当期' | '正常化';
    impliedReturn: number;
    threshold: number;
    verdict: 'pass' | 'fail';
    pb: number;
    note: string;
  } | null;
}

/** 要求回报门槛：与个股 PB-ROE 反推同一把尺子，保证 ETF 与个股结论可比 */
export const ETF_REQUIRED_RETURN = 8;
/** 永续增长率假设 */
export const ETF_PERPETUAL_G = 3;
/** 当期 ROE 比正常化 ROE 高出多少算「周期顶部盈利」（相对幅度） */
export const ROE_PEAK_GAP = 0.35;

/**
 * PB-ROE 反推：r = g + (ROE − g) / PB
 *
 * 戈登模型的变形。前提是 ROE 可持续——对周期股必须换成正常化 ROE，
 * 否则会把「今年赚得多」当成「永远赚得多」。
 */
export function impliedReturn(roe: number, pb: number, g = ETF_PERPETUAL_G): number | null {
  if (!(pb > 0) || roe == null) return null;
  return g + (roe - g) / pb;
}

export function cycleGuard(idx: EtfIndex | undefined): CycleGuard {
  const none: CycleGuard = { triggered: false, kind: null, reasons: [], normalized: null };
  if (!idx || !idx.cyclical || idx.cyclical.level === 'none') return none;

  const reasons: string[] = [];
  let kind: CycleGuard['kind'] = null;
  const zone = idx.cycle?.zone;
  const v = indexValuation(idx);

  if (v && zone) {
    /* 「PE 十年分位 5%」在航运里出现过，但同一时刻运价在十年新高——
       两个读数都真，含义相反。低 PE 是分子小造成的便宜假象。 */
    if ((zone === 'peak' || zone === 'high') && v.value <= 35) {
      kind = 'peak-pe-low';
      reasons.push(
        `${idx.cycle?.indicator ?? '景气指标'} 处${
          zone === 'peak' ? '周期顶部' : '周期高位'
        }，而 ${v.basis} ${v.value.toFixed(0)} 偏低——低估值来自分母变大，不是价格变便宜`
      );
    }
    if ((zone === 'low' || zone === 'trough') && v.value >= 65) {
      kind = 'trough-pe-high';
      reasons.push(
        `${idx.cycle?.indicator ?? '景气指标'} 处周期${
          zone === 'trough' ? '底部' : '低位'
        }，而 ${v.basis} ${v.value.toFixed(0)} 偏高——高估值来自分母变小，不是价格变贵`
      );
    }
  }

  /* PB-ROE 反推：强制用正常化 ROE。
     航运当期 ROE 11.6%，正常化约 7%——用前者算出「隐含回报 10%」会得出
     「很便宜」，用后者只有 6.3%，低于 8% 门槛。差的这部分就是周期红利。 */
  let normalized: CycleGuard['normalized'] = null;
  const pb = idx.pb;
  const roeNow = idx.roe;
  const roeNorm = idx.cyclical.normalizedRoe;
  if (roeNow != null && pb != null && pb > 0) {
    const useNorm = roeNorm != null && roeNow > roeNorm * (1 + ROE_PEAK_GAP);
    const roeUsed = useNorm ? roeNorm : roeNow;
    const r = impliedReturn(roeUsed, pb);
    if (r != null) {
      normalized = {
        roeUsed,
        roeSource: useNorm ? '正常化' : '当期',
        impliedReturn: r,
        threshold: ETF_REQUIRED_RETURN,
        verdict: r >= ETF_REQUIRED_RETURN ? 'pass' : 'fail',
        pb,
        note: useNorm
          ? `当期 ROE ${roeNow.toFixed(1)}% 比正常化 ${roeNorm.toFixed(1)}% 高 ${(
              (roeNow / roeNorm - 1) * 100
            ).toFixed(0)}%，按正常化 ROE 反推`
          : '当期 ROE 未显著高于正常化中枢，直接使用当期读数',
      };
      if (r < ETF_REQUIRED_RETURN) {
        reasons.push(
          `PB ${pb.toFixed(2)} × ROE ${roeUsed.toFixed(1)}%（${normalized.roeSource}）反推隐含长期回报 ${r.toFixed(
            1
          )}%，低于 ${ETF_REQUIRED_RETURN}% 门槛`
        );
      }
    }
  }

  return { triggered: reasons.length > 0, kind, reasons, normalized };
}

export interface EntryAssessment {
  grade: EntryGrade;
  kind: 'pe' | 'pb' | 'none';
  percentile: PctPick | null;
  reliability: PctReliability | null;
  /** 说不清的具体理由，按「换尺 / 窗口分歧 / 口径分歧 / 样本不足 / 指标背离」分类 */
  blocks: string[];
  /** 不构成 block、但必须让用户知道的口径说明 */
  notes: string[];
  /** 周期股守卫的结论。非周期行业为 null */
  cycle: CycleGuard | null;
  headline: string;
}

/**
 * 入场分只回答一件事：这个指数现在贵不贵。
 * 关键原则是**证据链有一环不可靠就不给方向**——不可靠的分位既不能支撑「便宜」，也不能支撑「贵」。
 * 所以它只有四档，没有「大概便宜」这种中间态。
 *
 * 2026-11 补充：加了 PB 背离检查。纳指 PE 分位 28（便宜）+ PB 分位 88.4（贵）
 * 却只按 PE 判「偏便宜」，和它自己的 caveat 直接冲突。
 */
export function entryAssessment(idx: EtfIndex | undefined): EntryAssessment {
  if (!idx) {
    return { grade: 'unclear', kind: 'none', percentile: null, reliability: null, blocks: ['缺底层指数'], notes: [], cycle: null, headline: '无底层指数' };
  }
  const v = indexValuation(idx);
  if (!v) {
    const why = typeof idx.pe === 'number' && idx.pe <= 0 ? '指数整体亏损且无 PB 分位可用' : '缺估值分位';
    return { grade: 'unclear', kind: 'none', percentile: null, reliability: null, blocks: [why], notes: [], cycle: null, headline: why };
  }
  const rel = percentileReliability(idx, v.window, idx.asOf);
  const blocks: string[] = [];
  const notes: string[] = [];

  if (v.kind === 'pb') blocks.push('PE 不可用，已换用 PB，而 PB 的便宜无法验证');
  const conflict = percentileWindowConflict(idx);
  if (conflict && conflict.kind === v.kind) blocks.push(`${conflict.long.label}与${conflict.short.label}方向相反`);
  const psc = peSourceConflict(idx);
  if (psc) blocks.push(`两个 PE 口径差 ${(psc.gap * 100).toFixed(0)}% 且结论相反`);
  if (rel?.level === 'low') blocks.push('分位样本不可比');

  /* PB 背离：能归因于 ROE 就只在 note 里说清，不能归因就不给方向。
     区别在于「这件事解释得通」和「这件事还没法下结论」——前者是信息，后者是风险。 */
  const div = metricDivergence(idx);
  if (div) {
    if (div.explainedByRoe === true) notes.push(div.reason);
    else blocks.push(div.reason);
  }

  /* 周期守卫：强周期行业在周期顶/底时，分位的方向是反的。
     这一类不给方向，因为「PE 低」和「便宜」在这个行业里是两件事。 */
  const cg = cycleGuard(idx);
  if (cg.kind) blocks.push(...cg.reasons);

  let grade: EntryGrade;
  if (blocks.length > 0) grade = 'unclear';
  else if (v.value <= 35) grade = 'cheap';
  else if (v.value <= 65) grade = 'fair';
  else grade = 'expensive';

  /* 隐含回报给档位设上限。这是第二把尺子，和分位并列而不是从属：
     分位回答「在历史区间的哪个位置」，PB-ROE 回答「按这个价格买，长期能拿多少」。
     两者冲突时取更保守的那个——因为后者才是决策依据。 */
  if (cg.normalized && grade !== 'unclear') {
    const r = cg.normalized.impliedReturn;
    const capByReturn: EntryGrade =
      r < ETF_REQUIRED_RETURN - 1.5 ? 'expensive' : r < ETF_REQUIRED_RETURN ? 'fair' : 'cheap';
    const ORDER: EntryGrade[] = ['cheap', 'fair', 'expensive'];
    if (ORDER.indexOf(grade) < ORDER.indexOf(capByReturn)) {
      notes.push(
        `分位读「${ENTRY_LABEL[grade]}」，但 PB ${cg.normalized.pb.toFixed(2)} × ROE ${cg.normalized.roeUsed.toFixed(
          1
        )}%（${cg.normalized.roeSource}）反推隐含回报 ${r.toFixed(1)}%，只支持「${
          ENTRY_LABEL[capByReturn]
        }」——取更保守的那个`
      );
      grade = capByReturn;
    }
  }

  /* 分位便宜但正常化 ROE 反推的隐含回报不到门槛 → 降为中性。
     这一步专门拦「周期红利被当成永久盈利能力」的误判。 */
  if (grade === 'cheap' && cg.normalized && cg.normalized.verdict === 'fail') {
    grade = 'fair';
    notes.push(
      `分位读数是便宜，但${cg.normalized.note}，隐含回报 ${cg.normalized.impliedReturn.toFixed(
        1
      )}% 未达 ${ETF_REQUIRED_RETURN}% 门槛——降为中性`
    );
  }
  if (cg.normalized && grade !== 'unclear') notes.push(cg.normalized.note);

  const basis = `${v.basis} ${v.value.toFixed(0)}`;
  /* unclear 时不要把「分位 X，但 PB 分位与 PE 分位差 Y 点」拼两遍——
     用户扫标题只看前半句，重复的数值会让真正的理由被挤到视线外。 */
  const headline = blocks.length
    ? `${blocks[0]}——不给方向`
    : `${basis}，${grade === 'cheap' ? '偏便宜' : grade === 'fair' ? '中性' : '偏贵'}`;

  return { grade, kind: v.kind, percentile: v, reliability: rel, blocks, notes, cycle: cg, headline };
}

export function costStateOf(e: Etf): CostState {
  if (e.premium == null) return 'unknown';
  return e.premium > premiumLimit(e) ? 'high' : 'ok';
}

export interface EtfVerdict {
  action: EtfAction;
  tool: ToolAssessment;
  entry: EntryAssessment;
  cost: CostState;
  /** 一句话结论，含动作理由 */
  sentence: string;
}

/** 动作矩阵：工具档位 × 入场档位。工具落后且指数还贵，就没有理由参与 */
const ACTION_MATRIX: Record<ToolGrade, Record<EntryGrade, EtfAction>> = {
  first: { cheap: 'buy', fair: 'wait', expensive: 'wait', unclear: 'wait' },
  competitive: { cheap: 'buy', fair: 'wait', expensive: 'wait', unclear: 'wait' },
  lagging: { cheap: 'switch', fair: 'skip', expensive: 'skip', unclear: 'skip' },
};

export function etfVerdict(e: Etf, idx: EtfIndex | undefined, peers?: Etf[], refDate?: string): EtfVerdict {
  const tool = toolAssessment(e, peers, refDate);
  const entry = entryAssessment(idx);
  const cost = costStateOf(e);

  let action: EtfAction;
  if (cost === 'high') {
    /* 溢价超容忍度是一票否决：这部分钱与指数涨跌无关，是买入当刻就付掉的确定性损失。
       它与「指数贵」不是一回事——指数贵可以等，溢价买贵了等不回来。 */
    action = 'avoid';
  } else if (cost === 'unknown' || tool.liq === 'unknown' || tool.feeRank === 'unknown') {
    /* 缺数据只判待核，不判回避——但必须与合格明确区分，否则「不知道」会被当成「没事」 */
    action = 'probe';
  } else {
    const m = ACTION_MATRIX[tool.grade][entry.grade];
    /* 落后 + 指数到位 = 换工具，但前提是真的存在一只「费率最低档 + 流动性达标」的替代品。
       光伏和电力都没有这样一只产品：0.20% 的成交只有 0.12–0.13 亿，流动性够的费率是 3 倍。
       这种时候「换工具」是空头支票，只能判不参与，并把原因说清。 */
    action = m === 'switch' && !tool.betterAlternative ? 'skip' : m;
  }

  const toolPart =
    tool.grade === 'first'
      ? '工具同类最优'
      : tool.grade === 'competitive'
        ? '工具处于竞争档'
        : tool.total === 1
          ? '工具本身不达标'
          : tool.rank === 1
            ? '同类里最好的一只，但绝对水平不合格'
            : '工具落后同类';
  const entryPart =
    entry.grade === 'cheap'
      ? '指数便宜'
      : entry.grade === 'fair'
        ? '指数中性'
        : entry.grade === 'expensive'
          ? '指数偏贵'
          : '指数贵贱说不清';

  const sentences: Record<EtfAction, string> = {
    buy: `${toolPart} + ${entryPart} → 两件事同时成立，可以执行`,
    switch: `${entryPart}，但${tool.headline.split('，')[0]} → 换 ${tool.betterAlternative}`,
    wait: `${toolPart}，但${entryPart} → 等指数，不需要换产品`,
    skip: `${toolPart}，${entryPart} → 两头都不占，不参与`,
    avoid: `溢价 ${e.premium?.toFixed(2)}% 超过 ${premiumLimit(e)}% 容忍度 → 与指数贵贱无关的确定性损失`,
    /* 待核的理由必须具体到「缺哪一项」，因为三项缺失的补救方式完全不同：
       折溢价要盘中查 IOPV，流动性要看近 20 日成交，费率要翻招募说明书 */
    probe:
      cost === 'unknown'
        ? '折溢价未取得——当刻买入成本未知，风险不是零，是没量出来'
        : tool.liq === 'unknown'
          ? `日均成交未取得——${tool.feeRank === 'high' ? `费率 ${e.fee.total}% 已确定落后，但换哪只需要流动性数据` : '买不进、卖不出的风险未知'}`
          : '费率未取得——无法判断它是不是同类最优',
  };

  return { action, tool, entry, cost, sentence: sentences[action] };
}

/** 汇总：给页面一个分布，用于判断规则有没有区分度——单一状态占比过高就是没区分度 */
export function etfScorecard(list: Etf[], indices: EtfIndex[], refDate?: string) {
  const count: Record<EtfAction, number> = { buy: 0, switch: 0, wait: 0, skip: 0, avoid: 0, probe: 0 };
  const byAction: Record<EtfAction, Etf[]> = { buy: [], switch: [], wait: [], skip: [], avoid: [], probe: [] };
  for (const e of list) {
    const v = etfVerdict(e, indices.find((i) => i.id === e.indexId), list, refDate);
    count[v.action] += 1;
    byAction[v.action].push(e);
  }
  return { count, byAction };
}

/** 按指数分组：入场分是共享的，一组只该出现一次 */
export function groupByIndex(list: Etf[], indices: EtfIndex[], refDate?: string) {
  return indices
    .map((idx) => {
      const members = list.filter((e) => e.indexId === idx.id);
      if (members.length === 0) return null;
      const entry = entryAssessment(idx);
      const ranked = toolRanking(members[0], members, refDate).map((e, i) => ({
        etf: e,
        rank: i + 1,
        verdict: etfVerdict(e, idx, list, refDate),
      }));
      return { idx, entry, rows: ranked };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}


/**
 * 组级结论：同一个指数下，工具层面到底有没有可选项。
 * 这一层是为了说清一件旧模型讲不出来的事——某些指数下所有 ETF 都不合格。
 * 光伏 4 只、电力 3 只全部「落后」：0.20% 那两只成交只有 0.12–0.13 亿，
 * 流动性够的那几只费率是最低档的 3 倍。这不是「各有所长」，是没有一只两头都占。
 */
export function groupSummary(rows: Array<{ verdict: EtfVerdict }>): string {
  const n = rows.length;
  const firsts = rows.filter((r) => r.verdict.tool.grade === 'first').length;
  const probes = rows.filter((r) => r.verdict.action === 'probe').length;
  const buys = rows.filter((r) => r.verdict.action === 'buy').length;
  if (n === 1) {
    return firsts ? '同指数仅此一只产品——「最优」是默认值，不是比较出来的' : '同指数仅此一只产品，且它自身有短板';
  }
  if (firsts === 0) {
    const lag = rows.filter((r) => r.verdict.tool.grade === 'lagging').length;
    if (lag === n) {
      return `${n} 只全部落在「落后」档：费率最低的成交不足，流动性够的费率高——没有一只两头都占`;
    }
    return `${n} 只里没有一只同时做到「费率最低档 + 流动性达标」：${lag} 只明确落后，其余 ${n - lag} 只无法与同类拉开差距`;
  }
  if (probes > 0 && firsts > 0) {
    return `${n} 只里 ${firsts} 只费率最低档，但其中 ${probes} 只缺折溢价或成交数据——补齐之前，「最优」只算纸面结论`;
  }
  return `${n} 只里 ${firsts} 只费率最低档${buys ? `，${buys} 只可直接配置` : ''}`;
}
