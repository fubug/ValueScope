#!/usr/bin/env node
// 数据校验：防止「数据停了没人发现」和「字段静默缺失」
// 用法：npm run check
// 退出码：1 = 有阻断性错误；0 = 通过（警告不阻断）
//
// 2026-11-15 起：个股的 status 不再手填，由三层过滤器派生。
// 本脚本直接 import 页面用的同一份规则（src/lib/rules.ts），
// 所以「校验口径」和「页面口径」物理上不可能漂移。
// 新增标的若漏填 certainty / payoutRatio / veto，CI 直接失败。

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  deriveEtfStatus,
  deriveStatus,
  threeLayer,
  marginOfSafety,
  buyZoneOf,
  dividendSpread,
  REQUIRED_DISCOUNT,
  ANCHOR_MIN_SPREAD,
  PAYOUT_MAX,
} from '../src/lib/rules.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const errors = [];
const warnings = [];

const STALE_DAYS = 45;
const today = new Date();
const daysSince = (iso) => Math.floor((today - new Date(iso)) / 86400000);

/* ---------- 市场 ---------- */
const markets = read('data/markets.json');
if (!markets.meta?.snapshot) errors.push('markets.json 缺少 meta.snapshot');
else {
  const d = daysSince(markets.meta.snapshot);
  if (d > STALE_DAYS) warnings.push(`市场快照已 ${d} 天未更新（阈值 ${STALE_DAYS} 天）——面板显示的是旧价格`);
}

const seen = new Set();
for (const m of markets.markets ?? []) {
  const tag = `market[${m.id ?? '?'}]`;
  if (!m.id) errors.push(`${tag} 缺少 id`);
  if (seen.has(m.id)) errors.push(`${tag} id 重复`);
  seen.add(m.id);

  if (!m.name || !m.indexName) errors.push(`${tag} 缺少 name/indexName`);
  if (!m.currency) errors.push(`${tag} 缺少 currency`);
  if (!Array.isArray(m.caveats)) errors.push(`${tag} caveats 必须是数组`);

  if (!['high', 'medium', 'low'].includes(m.confidence)) {
    errors.push(`${tag} confidence 非法：${m.confidence}`);
  }

  // 低置信度必须给出原因，否则等于没有提示
  if (m.confidence !== 'high' && (m.caveats?.length ?? 0) === 0) {
    errors.push(`${tag} 置信度 ${m.confidence} 但 caveats 为空，必须说明原因`);
  }

  // 有结论但没有任何估值分位 → 规则会判 unknown，属于配置错误
  const p = m.percentiles ?? {};
  const hasPct = ['pe', 'pb', 'cape'].some((k) =>
    ['y5', 'y10', 'y20'].some((w) => typeof p[k]?.[w] === 'number')
  );
  if (m.analystView && !hasPct) {
    warnings.push(`${tag} 无估值分位但有 analystView，页面会显示「数据不足」，确认是有意的`);
  }

  // ERP 与无风险利率并存时做一次算术校验，抓录入错误
  const { erp, riskFree } = m.rates ?? {};
  if (typeof erp === 'number' && typeof riskFree === 'number' && Math.abs(erp) > 20) {
    warnings.push(`${tag} ERP=${erp}% 绝对值过大，检查是否漏了百分号换算`);
  }
}

/* ---------- 个股 ---------- */
const stocks = read('data/stocks.json');

// 绝对锚的分母：没有它，层1 无法计算，三层过滤器就是摆设
const rfMeta = stocks.meta?.riskFree;
let rf = null;
if (!rfMeta) {
  errors.push('stocks.json 缺少 meta.riskFree —— 三层过滤器的「绝对锚」依赖 10Y 国债收益率，不能为空');
} else {
  if (typeof rfMeta.value !== 'number' || !Number.isFinite(rfMeta.value)) {
    errors.push('meta.riskFree.value 必须是数字（单位：%）');
  } else {
    rf = rfMeta.value;
    if (rf < 0 || rf > 10) errors.push(`meta.riskFree.value=${rf}% 不合理，检查是否漏了百分号换算`);
  }
  if (!rfMeta.label) errors.push('meta.riskFree 缺少 label');
  if (!rfMeta.asOf) errors.push('meta.riskFree 缺少 asOf —— 利率会变，锚必须标时点');
  else if (daysSince(rfMeta.asOf) > STALE_DAYS) {
    warnings.push(`无风险利率已 ${daysSince(rfMeta.asOf)} 天未更新，绝对锚可能失真`);
  }
}

const CERTAINTIES = ['high', 'medium', 'low'];
const tickers = new Set();
const statusTally = { buy: 0, watch: 0, avoid: 0 };

for (const s of stocks.stocks ?? []) {
  const tag = `stock[${s.ticker ?? '?'}]`;
  if (!s.ticker) errors.push(`${tag} 缺少 ticker`);
  if (tickers.has(s.ticker)) errors.push(`${tag} ticker 重复`);
  tickers.add(s.ticker);

  if (!s.thesis || s.thesis.length < 20) errors.push(`${tag} thesis 过短，价值分析必须写清理由`);
  if (!Array.isArray(s.risks) || s.risks.length === 0) errors.push(`${tag} 必须至少写一条风险/反证条件`);
  if (!s.fairValue?.method) errors.push(`${tag} 缺少 fairValue.method，合理价值必须说明怎么算的`);
  if (s.sample) warnings.push(`${tag} 仍是示例数据，正式使用前替换`);

  /* --- 三层过滤器的必填项：缺一个就等于漏掉一次评估 --- */
  if (!CERTAINTIES.includes(s.certainty)) {
    errors.push(`${tag} certainty 必须是 high/medium/low —— 它决定要求折价，进而决定买入价`);
  }
  if (typeof s.payoutRatio !== 'number' || !Number.isFinite(s.payoutRatio)) {
    errors.push(`${tag} payoutRatio 必须是数字（%）—— 绝对锚需要它判断分红是不是借债分红`);
  } else if (s.payoutRatio <= 0 || s.payoutRatio > 200) {
    errors.push(`${tag} payoutRatio=${s.payoutRatio}% 超出合理范围`);
  }
  if (!s.anchorNote || s.anchorNote.length < 30) {
    errors.push(`${tag} anchorNote 过短 —— 必须写清高股息背后的可持续性，不能只看利差大小`);
  }
  if (!s.veto || typeof s.veto !== 'object') {
    errors.push(`${tag} 缺少 veto（反证条件）—— 没有一票否决位，硬伤会被「便宜」抵掉`);
  } else {
    if (typeof s.veto.triggered !== 'boolean') errors.push(`${tag} veto.triggered 必须是布尔值`);
    if (!s.veto.condition || s.veto.condition.length < 15) {
      errors.push(`${tag} veto.condition 过短 —— 必须写成可证伪的观测条件`);
    }
    if (!s.veto.observation || s.veto.observation.length < 10) {
      errors.push(`${tag} veto.observation 过短 —— 即使未触发，也要写清现在离触发还有多远`);
    }
  }
  if ('buyZone' in s) {
    errors.push(`${tag} buyZone 已废弃：买入价由 certainty 派生，手填会让规则绕过校验`);
  }
  if (s.valuation?.dividendYield == null) {
    errors.push(`${tag} 缺股息率，层1「绝对锚」无法计算 —— 不能用「没有股息」逃避这一层，请填 0`);
  }

  /* --- 算术自洽：派息率应与 股息率×PE 同量级，差异大说明口径要交代 --- */
  const dy = s.valuation?.dividendYield;
  const pe = s.valuation?.peTtm;
  if (typeof s.payoutRatio === 'number' && typeof dy === 'number' && typeof pe === 'number' && pe > 0) {
    const implied = dy * pe;
    if (Math.abs(s.payoutRatio - implied) > 25) {
      warnings.push(
        `${tag} payoutRatio=${s.payoutRatio}% 与 股息率×PE=${implied.toFixed(1)}% 差异 ${Math.abs(
          s.payoutRatio - implied
        ).toFixed(0)}pct，确认口径（如分红挂营运利润）已在 anchorNote 说明`
      );
    }
  }

  /* --- 派生状态必须与手填一致：防止新增标的时忘了重算 --- */
  if (rf != null && CERTAINTIES.includes(s.certainty) && s.veto) {
    const derived = deriveStatus(s, rf);
    statusTally[derived] += 1;
    if (s.status !== derived) {
      errors.push(
        `${tag} status="${s.status}" 与规则派生结果 "${derived}" 不一致。` +
          `status 是派生值，不要手改；若认为结论不对，改 certainty/payoutRatio/veto 的输入或改规则本身。`
      );
    }
    // 高确定性 + 硬伤已触发 = 自相矛盾，多半是 certainty 填错了
    if (s.certainty === 'high' && s.veto.triggered) {
      warnings.push(`${tag} 标为高确定性但 veto 已触发，检查 certainty 是否高估`);
    }
    if (derived === 'buy') {
      const mos = marginOfSafety(s);
      if (mos == null) errors.push(`${tag} 被判为可买入但算不出安全边际`);
    }
  }

  // 深度调研的结构要求：不完整就等于「看着很详细但结论没依据」
  if (s.deepDive) {
    const d = s.deepDive;
    if (!d.whatYouBet || d.whatYouBet.length < 40) {
      errors.push(`${tag} deepDive.whatYouBet 过短，必须一句话说清「这个价格在赌什么」`);
    }
    if (!Array.isArray(d.moat) || d.moat.length < 2) errors.push(`${tag} deepDive.moat 至少 2 条`);
    if (!Array.isArray(d.financials) || d.financials.length < 1) errors.push(`${tag} deepDive.financials 为空`);
    if (!Array.isArray(d.timeline) || d.timeline.length < 1) {
      errors.push(`${tag} deepDive.timeline 为空，必须给出「什么时候能知道判断对不对」`);
    }
    if (!Array.isArray(d.valuationModels) || d.valuationModels.length < 2) {
      errors.push(`${tag} deepDive.valuationModels 至少 2 个方法，单一模型容易被参数操纵`);
    }
    const results = (d.valuationModels ?? []).map((v) => v.result).filter((v) => typeof v === 'number');
    if (results.length && typeof s.fairValue?.low === 'number' && typeof s.fairValue?.high === 'number') {
      const outliers = results.filter((r) => r < s.fairValue.low * 0.8 || r > s.fairValue.high * 1.2);
      if (outliers.length) {
        warnings.push(
          `${tag} 估值结果 ${outliers.join('/')} 偏离合理价值区间 ${s.fairValue.low}-${s.fairValue.high} 超过 20%，检查假设或区间`
        );
      }
    }
  }
}

if ((stocks.stocks ?? []).length === 0) warnings.push('个股列表为空，页面会只显示录入指引');

/* ---------- ETF ---------- */
const etfs = read('data/etfs.json');
{
  const ETF_TYPES = ['QDII-LOF', 'QDII-ETF', 'ETF', 'LOF'];
  const etfTally = { buy: 0, watch: 0, avoid: 0 };
  globalThis.__etfTally = etfTally;
  const SUBS = ['open', 'limited', 'suspended'];
  const indexIds = new Set();

  for (const i of etfs.indices ?? []) {
    const tag = `index[${i.id ?? '?'}]`;
    if (!i.id) errors.push(`${tag} 缺少 id`);
    if (indexIds.has(i.id)) errors.push(`${tag} id 重复`);
    indexIds.add(i.id);
    if (!i.name || !i.code) errors.push(`${tag} 缺少 name/code`);
    if (!i.asOf) errors.push(`${tag} 缺少 asOf——估值分位必须标时点`);

    const hasPct = ['y3', 'y5', 'y10'].some((w) => typeof i.pePct?.[w] === 'number');
    if (!hasPct) errors.push(`${tag} 没有任何 PE 分位，ETF 的「估值层」会直接判不合格`);
    for (const w of ['y3', 'y5', 'y10']) {
      const v = i.pePct?.[w];
      if (v != null && (v < 0 || v > 100)) errors.push(`${tag} pePct.${w}=${v} 超出 0–100`);
    }

    // 分位必须可追溯：没有来源的分位等于编的
    if (!Array.isArray(i.sources) || i.sources.length === 0) {
      errors.push(`${tag} 缺少 sources——分位从哪来的必须写清`);
    }
    // 口径冲突是常态，但有冲突就必须交代
    if (!i.peCaveat || i.peCaveat.length < 20) {
      warnings.push(`${tag} 没有 peCaveat：跨市场 PE 口径差异大，建议说明用的是哪套口径`);
    }
  }

  for (const e of etfs.etfs ?? []) {
    const tag = `etf[${e.code ?? '?'}]`;
    if (!e.code) errors.push(`${tag} 缺少 code`);
    if (!ETF_TYPES.includes(e.type)) errors.push(`${tag} type 非法：${e.type}`);
    if (!indexIds.has(e.indexId)) errors.push(`${tag} indexId="${e.indexId}" 在 indices 里不存在`);
    if (!SUBS.includes(e.subscription)) errors.push(`${tag} subscription 非法：${e.subscription}`);
    if (!e.subscriptionNote || e.subscriptionNote.length < 10) {
      errors.push(`${tag} subscriptionNote 过短——申购状态是「能不能执行」的关键，必须说明`);
    }
    if (!e.role || e.role.length < 4) errors.push(`${tag} 缺少 role：这个 ETF 在组合里干什么用`);
    if (!Array.isArray(e.caveats) || e.caveats.length === 0) {
      errors.push(`${tag} 必须至少写一条 caveat`);
    }

    // 费率可以为空，但必须说明为什么空——不能静默缺失
    if (e.fee?.total == null && (!e.fee?.note || e.fee.note.length < 6)) {
      errors.push(`${tag} 费率为空时必须用 fee.note 说明原因`);
    }

    // 溢价与价格/净值必须自洽，抓录入错误
    if (e.premium != null) {
      if (e.premium < -20 || e.premium > 60) errors.push(`${tag} premium=${e.premium}% 超出合理范围`);
      if (typeof e.price === 'number' && typeof e.nav === 'number' && e.nav > 0) {
        const implied = (e.price / e.nav - 1) * 100;
        if (Math.abs(implied - e.premium) > 0.5) {
          errors.push(
            `${tag} 溢价 ${e.premium}% 与 price/nav 推算的 ${implied.toFixed(2)}% 不一致，检查是否取错日期或净值`
          );
        }
      }
      // 高溢价必须有解释，不能只填个数字
      if (e.premium > 2 && (e.caveats?.length ?? 0) < 2) {
        errors.push(`${tag} 溢价 ${e.premium}% 超过 2%，但 caveats 少于 2 条——高溢价必须给出原因`);
      }
    }

    // 状态与派生结果对齐（ETF 的 status 不落库，这里只校验派生结果本身不会异常）
    const idx = (etfs.indices ?? []).find((i) => i.id === e.indexId);
    const derived = deriveEtfStatus(e, idx);
    if (!['buy', 'watch', 'avoid'].includes(derived)) {
      errors.push(`${tag} 派生状态异常：${derived}`);
    }
    etfTally[derived] += 1;
    if (derived === 'buy' && e.premium == null) {
      errors.push(`${tag} 被判为可配置，但溢价未取得——成本层不可能通过`);
    }
  }

  if ((etfs.etfs ?? []).length === 0) warnings.push('ETF 列表为空');
}

/* ---------- 红利低波专题 ---------- */
// 这个页面的核心是两个互相矛盾的指标。矛盾本身允许存在，但每个数字必须自洽，
// 否则页面会变成「用两套口径各自支撑一个结论」。
const div = read('data/dividend.json');
{
  const tag = 'dividend';
  const v = div.valuation ?? {};
  const c = div.conflict ?? {};
  const rf = div.meta?.riskFree?.value;

  if (typeof rf !== 'number') errors.push(`${tag} 缺少 meta.riskFree.value，绝对锚无法复算`);
  if (typeof v.dividendYield !== 'number' || typeof v.pe !== 'number') {
    errors.push(`${tag} 缺 valuation.dividendYield / pe`);
  } else {
    // 派息率 = 股息率 × PE，误差超过 1pct 说明分子分母用了不同口径
    const implied = v.dividendYield * v.pe;
    if (typeof v.payoutRatio === 'number' && Math.abs(implied - v.payoutRatio) > 1) {
      errors.push(`${tag} 派息率不自洽：${v.dividendYield}% × ${v.pe} = ${implied.toFixed(1)}%，但写了 ${v.payoutRatio}%`);
    }
    if (typeof rf === 'number' && typeof c.spread === 'number') {
      const s = v.dividendYield - rf;
      if (Math.abs(s - c.spread) > 0.06) {
        errors.push(`${tag} 股息利差不自洽：${v.dividendYield}% − ${rf}% = ${s.toFixed(2)}，但写了 ${c.spread}`);
      }
    }
    for (const sc of div.spreadDecomposition?.scenarios ?? []) {
      const s = v.dividendYield - sc.yield10y;
      if (Math.abs(s - sc.spread) > 0.06) {
        errors.push(`${tag} 情景「${sc.label}」利差不自洽：应为 ${s.toFixed(2)}，写了 ${sc.spread}`);
      }
    }
  }

  // 分裂叙述里的分位必须与 valuation 同源，否则「80% vs 37%」这组对比是拼出来的
  if (typeof c.pePct === 'number' && Math.abs(c.pePct - (v.pePct?.y10 ?? NaN)) > 0.5) {
    errors.push(`${tag} conflict.pePct 与 valuation.pePct.y10 不一致（${c.pePct} vs ${v.pePct?.y10}）`);
  }
  if (typeof c.pe5Pct === 'number' && Math.abs(c.pe5Pct - (v.pePct?.y5 ?? NaN)) > 0.5) {
    errors.push(`${tag} conflict.pe5Pct 与 valuation.pePct.y5 不一致（${c.pe5Pct} vs ${v.pePct?.y5}）`);
  }
  if (typeof c.spreadPct === 'number' && Math.abs(c.spreadPct - (v.dyPct?.y10 ?? NaN)) > 0.5) {
    errors.push(`${tag} conflict.spreadPct 与 valuation.dyPct.y10 不一致`);
  }

  // 集中度：银行权重必须与行业表里那条对得上，且合计不能超过 100
  const con = div.concentration ?? {};
  const sumW = (con.sectors ?? []).reduce((a, s) => a + (s.weight ?? 0), 0);
  if (sumW > 100.5) errors.push(`${tag} 行业权重合计 ${sumW.toFixed(2)}% 超过 100%`);
  const bankRow = (con.sectors ?? []).find((s) => s.name === '银行');
  if (bankRow && typeof con.bankWeight === 'number' && Math.abs(bankRow.weight - con.bankWeight) > 0.05) {
    errors.push(`${tag} bankWeight ${con.bankWeight} 与行业表里的银行权重 ${bankRow.weight} 不一致`);
  }
  if (typeof con.bankWeight === 'number' && con.bankWeight < 30) {
    warnings.push(`${tag} 银行权重 ${con.bankWeight}% 偏低，确认是否换了指数口径`);
  }

  // 工具引用完整性：专题页列的工具必须真的在 etfs.json 里，否则链接是死的
  const codes = new Set((etfs.etfs ?? []).map((e) => e.code));
  for (const t2 of div.tools ?? []) {
    if (!codes.has(t2.code)) errors.push(`${tag} 引用的 ETF ${t2.code} 不在 data/etfs.json 中`);
  }
  if (!Array.isArray(div.tools) || div.tools.length < 2) {
    warnings.push(`${tag} 工具对比不足 2 只，无法体现费率差异`);
  }

  // 结论必须带边界条件，否则又是一个不可推翻的判断
  if ((div.verdict?.conditions?.buyIf ?? []).length < 2) errors.push(`${tag} buyIf 至少 2 条`);
  if ((div.verdict?.conditions?.avoidIf ?? []).length < 2) errors.push(`${tag} avoidIf 至少 2 条`);

  // status 与三层派生对齐
  const dIdx = (etfs.indices ?? []).find((i) => i.id === 'csi-divlow');
  const dEtf = (etfs.etfs ?? []).find((e) => e.code === '512890');
  if (dIdx && dEtf && div.verdict?.status) {
    const derived = deriveEtfStatus(dEtf, dIdx);
    if (derived !== div.verdict.status) {
      errors.push(
        `${tag} verdict.status=${div.verdict.status}，但按三层复算是 ${derived}——改结论要改输入或改规则，不能只改字`
      );
    }
  } else if (!dIdx) {
    errors.push(`${tag} data/etfs.json 里找不到 csi-divlow 指数`);
  }
}

/* ---------- 行业 ---------- */
const sectors = read('data/sectors.json');
for (const s of sectors.sectors ?? []) {
  const tag = `sector[${s.id ?? s.name ?? '?'}]`;
  if (!s.rationale || s.rationale.length < 40) errors.push(`${tag} rationale 过短`);
  if (!Array.isArray(s.risks) || s.risks.length === 0) errors.push(`${tag} 缺少反证/风险，观点不可推翻等于没有观点`);
  if (s.pePercentile != null && (s.pePercentile < 0 || s.pePercentile > 100)) {
    errors.push(`${tag} pePercentile 超出 0-100`);
  }
}

/* ---------- 输出 ---------- */
const line = '─'.repeat(56);
console.log(line);
console.log(`数据校验 · ${today.toISOString().slice(0, 10)}`);
console.log(line);
console.log(
  `市场 ${markets.markets?.length ?? 0} · 个股 ${stocks.stocks?.length ?? 0} · ETF ${etfs.etfs?.length ?? 0} · 行业 ${sectors.sectors?.length ?? 0}`
);
if (rf != null) {
  console.log(`绝对锚分母：10Y 国债 ${rf}%（${rfMeta.asOf}）· 利差下限 ${ANCHOR_MIN_SPREAD}pct · 派息率上限 ${PAYOUT_MAX}%`);
  console.log(
    `三层过滤器：可买入 ${statusTally.buy} · 需观察 ${statusTally.watch} · 便宜但不买 ${statusTally.avoid}`
  );
  if (globalThis.__etfTally) {
    const t2 = globalThis.__etfTally;
    console.log(`ETF 三层：可配置 ${t2.buy} · 需观察 ${t2.watch} · 回避 ${t2.avoid}`);
  }
  console.log(
    `要求折价：高确定性 -${(REQUIRED_DISCOUNT.high * 100).toFixed(0)}% · 中 -${(
      REQUIRED_DISCOUNT.medium * 100
    ).toFixed(0)}% · 低 -${(REQUIRED_DISCOUNT.low * 100).toFixed(0)}%`
  );
  if (statusTally.buy === 0 && (stocks.stocks?.length ?? 0) > 0) {
    console.log('  → 当前 0 只三层全过。这是结论不是漏项：卡点逐只列在 /stocks/ 的三层过滤器表里。');
  }
}

if (warnings.length) {
  console.log(`\n⚠ 警告 ${warnings.length} 条：`);
  warnings.forEach((w) => console.log('  · ' + w));
}
if (errors.length) {
  console.log(`\n✗ 错误 ${errors.length} 条：`);
  errors.forEach((e) => console.log('  · ' + e));
  console.log('\n校验未通过，请修复后再提交。');
  process.exit(1);
}
console.log('\n✓ 校验通过');
