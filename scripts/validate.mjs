#!/usr/bin/env node
// 数据校验：防止「数据停了没人发现」和「字段静默缺失」
// 用法：npm run check
// 退出码：1 = 有阻断性错误；0 = 通过（警告不阻断）

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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
const tickers = new Set();
for (const s of stocks.stocks ?? []) {
  const tag = `stock[${s.ticker ?? '?'}]`;
  if (!s.ticker) errors.push(`${tag} 缺少 ticker`);
  if (tickers.has(s.ticker)) errors.push(`${tag} ticker 重复`);
  tickers.add(s.ticker);

  if (!['buy', 'watch', 'avoid'].includes(s.status)) errors.push(`${tag} status 非法：${s.status}`);
  if (!s.thesis || s.thesis.length < 20) errors.push(`${tag} thesis 过短，价值分析必须写清理由`);
  if (!Array.isArray(s.risks) || s.risks.length === 0) errors.push(`${tag} 必须至少写一条风险/反证条件`);
  if (!s.fairValue?.method) errors.push(`${tag} 缺少 fairValue.method，合理价值必须说明怎么算的`);

  if (s.status === 'buy' && (s.price == null || s.fairValue?.mid == null)) {
    warnings.push(`${tag} 标记为「可买入」但没有现价/合理价值，页面无法计算安全边际`);
  }
  if (s.status === 'buy' && typeof s.fairValue?.mid === 'number' && typeof s.price === 'number' && s.price > s.fairValue.mid) {
    errors.push(`${tag} 状态为「可买入」但现价 ${s.price} 高于合理价值中值 ${s.fairValue.mid}，逻辑矛盾`);
  }
  if (s.sample) warnings.push(`${tag} 仍是示例数据，正式使用前替换`);

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
console.log(`市场 ${markets.markets?.length ?? 0} · 个股 ${stocks.stocks?.length ?? 0} · 行业 ${sectors.sectors?.length ?? 0}`);

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
