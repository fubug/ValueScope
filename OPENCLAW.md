# OpenClaw 对接指南

## 概述

ValueScope 是纯静态展示站点，所有市场数据由 OpenClaw 每日采集、计算后写入仓库。本文件说明数据格式、存放规则和评分框架。

## 数据存放规则

- 路径：`data/daily/YYYY-MM-DD.json`
- 每天一个文件，文件名中的日期必须与内容中的 `date` 字段一致
- 文件编码 UTF-8，JSON 格式
- ValueScope 构建时会读取 `data/daily/` 下所有 JSON 文件，按日期排序

## 完整数据格式

```json
{
  "date": "2026-05-16",
  "markets": [
    {
      "market": "kr",
      "market_name": "韩国",
      "index_name": "KOSPI",
      "fish_score": 72,
      "dimensions": {
        "info_aggregation": { "score": 70, "weight": 0.20 },
        "transaction_cost": { "score": 75, "weight": 0.20 },
        "incentive_alignment": { "score": 65, "weight": 0.20 },
        "risk_dispersion": { "score": 60, "weight": 0.20 },
        "property_rights": { "score": 68, "weight": 0.20 }
      },
      "raw_indicators": {
        "analyst_coverage_depth": 0.65,
        "earnings_surprise_std": 0.032,
        "short_selling_allowed": true,
        "price_impact_ratio": 0.15,
        "total_commission_rate": 0.0015,
        "bid_ask_spread_bps": 6.5,
        "settlement_days": 2,
        "withholding_tax": 0.15,
        "capital_gains_tax": 0.11,
        "amihud_illiquidity": 2.3e-9,
        "shareholder_activism_score": 0.55,
        "board_independence_ratio": 0.70,
        "rpt_control_score": 0.65,
        "earnings_quality_score": 0.72,
        "insider_trading_enforcement": 0.60,
        "derivatives_depth": 0.55,
        "options_available": true,
        "capital_flow_freedom": 0.70,
        "foreign_ownership_limit": 1.0,
        "etf_variety": 0.65,
        "rule_of_law_index": 0.78,
        "judicial_independence": 0.72,
        "fraud_enforcement_rate": 0.65,
        "delisting_rate": 0.015,
        "investor_protection_index": 6.2,
        "accounting_standards": 1.0
      }
    }
  ]
}
```

## 字段说明

### 必填字段（每条 market）

| 字段 | 类型 | 说明 |
|------|------|------|
| `market` | string | 市场标识符，见下方市场列表 |
| `market_name` | string | 显示名称，如"韩国"、"A股" |
| `index_name` | string | 指数名称，如"KOSPI"、"沪深300" |
| `fish_score` | number | 综合鱼数评分，0-100 整数 |
| `dimensions` | object | 五个维度的评分和权重，见下方 |
| `raw_indicators` | object | 原始指标数据，尽量完整填写 |

### dimensions 五维评分

每个维度包含 `score`（0-100）和 `weight`（固定权重 0.20）：

| 维度 | 字段名 | 固定权重 | 第一性原理 |
|------|--------|---------|-----------|
| 信息聚合 | `info_aggregation` | 0.20 | 价格必须尽可能接近未来现金流真实折现值 |
| 交易成本 | `transaction_cost` | 0.20 | 摩擦必须趋近物理极限 |
| 激励对齐 | `incentive_alignment` | 0.20 | 说真话、创造真实价值、长期主义必须是最优策略 |
| 风险分散 | `risk_dispersion` | 0.20 | 风险能被任意拆分、全球自由匹配给最合适的人 |
| 产权执行 | `property_rights` | 0.20 | 证券纸上权利100%可兑现 |

### fish_score 计算规则

```
fish_score = round(
  info_aggregation.score      × 0.20
+ transaction_cost.score      × 0.20
+ incentive_alignment.score   × 0.20
+ risk_dispersion.score       × 0.20
+ property_rights.score       × 0.20
)
```

五个维度等权，因为它们是并列的根因，缺一不可。

---

## 五维评分：采集指标与计算公式

以下详细说明每个维度需要采集哪些原始指标、从哪里获取、以及如何将原始数据换算为 0-100 的维度评分。

### 获取类型说明

| 获取类型 | 含义 |
|---------|------|
| **API可取** | 可通过 yfinance / AKShare / FRED 等接口直接获取 |
| **API可算** | 基于API获取的数据进行二次计算即可得出 |
| **搜索整理** | 无现成API，需要通过网络搜索、查找官方报告获取 |

**重点说明**：标注为"搜索整理"的指标没有标准化数据接口，OpenClaw 需通过搜索各国统计局、央行、世界银行、IMF 等权威来源获取。这类指标变化缓慢，建议**缓存上次结果，按季度定期刷新**。

---

### 维度一：信息聚合 `info_aggregation`（权重 20%）

**第一性原理**：价格必须尽可能接近未来现金流真实折现值。市场信息汇聚效率越高，价格越有效，投资者越能基于价格做出正确决策。

**必须采集的指标**：

| raw_indicators 字段 | 含义 | 单位 | 获取方式 | 获取类型 |
|---------------------|------|------|---------|---------|
| `analyst_coverage_depth` | 指数成分股平均分析师覆盖数量（归一化） | 0-1 | Bloomberg / 金融数据商 | 搜索整理 |
| `earnings_surprise_std` | 业绩超预期标准差 | 小数 | 统计成分股实际EPS vs 预期EPS的偏差 | 搜索整理 |
| `short_selling_allowed` | 是否允许做空 | boolean | 交易所规则 | 搜索整理 |
| `price_impact_ratio` | 价格中市场系统性成分占比（R²） | 0-1 | 个股收益对市场收益回归的R² | API可算 |
| `market_efficiency_index` | 市场效率指数（波动率/收益率比值反向） | 0-1 | 1 - (年化波动率 / 年化收益)，下限0 | API可算 |

**评分公式**：

```
// 分析师覆盖深度：直接映射
sub1 = analyst_coverage_depth × 100

// 业绩超预期偏差（反向）：越小越好。2%=90, 5%=60, >10%=20
sub2 = clamp(100 - earnings_surprise_std × 1600, 10, 100)

// 做空机制：允许=100（价格纠错机制完整），不允许=30
sub3 = short_selling_allowed ? 100 : 30

// 价格冲击比（反向）：个股R²越低=个股定价越独立。>0.8=30, 0.5=70, <0.3=100
sub4 = clamp(130 - price_impact_ratio × 100, 10, 100)

// 市场效率：直接映射
sub5 = clamp(market_efficiency_index × 100, 0, 100)

info_aggregation.score = round(sub1 × 0.20 + sub2 × 0.20 + sub3 × 0.15 + sub4 × 0.25 + sub5 × 0.20)
```

---

### 维度二：交易成本 `transaction_cost`（权重 20%）

**第一性原理**：摩擦（佣金、滑点、税、结算周期、流动性成本）必须趋近物理极限。交易成本越低，资本配置效率越高。

**必须采集的指标**：

| raw_indicators 字段 | 含义 | 单位 | 获取方式 | 获取类型 |
|---------------------|------|------|---------|---------|
| `total_commission_rate` | 综合佣金率（含规费） | 小数 | 券商公开费率 | 搜索整理 |
| `bid_ask_spread_bps` | 买卖价差（基点） | bps | (卖一 - 买一) / 中间价 × 10000 | 搜索整理 |
| `settlement_days` | 交割周期（T+N） | 天 | 交易所规则 | 搜索整理 |
| `withholding_tax` | 股息预扣税率 | 小数 | 各国税法 | 搜索整理 |
| `capital_gains_tax` | 资本利得税率 | 小数 | 各国税法 | 搜索整理 |
| `amihud_illiquidity` | Amihud非流动性指标 | 小数 | 近20日均值(｜收益率｜/成交额) | API可算 |

**评分公式**：

```
// 综合佣金率（反向）：<0.05%=100, 0.1%=80, 0.3%=40, >0.5%=10
sub1 = clamp(120 - total_commission_rate × 25000, 10, 100)

// 买卖价差（反向）：<5bps=100, 10bps=70, 20bps=40, >50bps=10
sub2 = clamp(120 - bid_ask_spread_bps × 2.2, 10, 100)

// 交割周期：T+0/T+1=100, T+2=75, T+3=45, >T+3=20
sub3 = settlement_days <= 1 ? 100 : settlement_days <= 2 ? 75 : settlement_days <= 3 ? 45 : 20

// 预扣税率（反向）：0%=100, 10%=80, 20%=60, >30%=20
sub4 = clamp((1 - withholding_tax) × 100, 10, 100)

// 资本利得税（反向）：0%=100, 15%=70, 25%=40, >30%=15
sub5 = clamp(100 - capital_gains_tax × 250, 10, 100)

// Amihud非流动性（反向）：越小越好
sub6 = clamp(100 - log10(amihud_illiquidity + 1e-12) × 20 - 60, 10, 100)

transaction_cost.score = round(sub1 × 0.15 + sub2 × 0.20 + sub3 × 0.10 + sub4 × 0.15 + sub5 × 0.15 + sub6 × 0.25)
```

---

### 维度三：激励对齐 `incentive_alignment`（权重 20%）

**第一性原理**：市场规则下，说真话、创造真实价值、长期主义必须是参与者（公司、管理层、投资者、监管者）唯一或最优策略。

**必须采集的指标**：

| raw_indicators 字段 | 含义 | 单位 | 获取方式 | 获取类型 |
|---------------------|------|------|---------|---------|
| `shareholder_activism_score` | 股东积极主义活跃度（提案/维权频率） | 0-1 | 机构投资者报告 / 代理投票数据 | 搜索整理 |
| `board_independence_ratio` | 指数成分股平均独立董事占比 | 0-1 | 公司治理报告 | 搜索整理 |
| `rpt_control_score` | 关联交易管控严格度 | 0-1 | 公司治理评级 / 交易所规则 | 搜索整理 |
| `short_selling_allowed` | 是否允许做空（惩罚造假的纠错机制） | boolean | 交易所规则 | 搜索整理 |
| `earnings_quality_score` | 盈利质量（应计利润占比低=好） | 0-1 | (经营现金流 - 净利润) / 总资产 的行业均值 | 搜索整理 |
| `insider_trading_enforcement` | 内幕交易执法力度 | 0-1 | 证监会/SEC 年度报告处罚统计 | 搜索整理 |

**评分公式**：

```
sub1 = shareholder_activism_score × 100
sub2 = board_independence_ratio × 100
sub3 = rpt_control_score × 100
sub4 = short_selling_allowed ? 100 : 25
sub5 = earnings_quality_score × 100
sub6 = insider_trading_enforcement × 100

incentive_alignment.score = round(sub1 × 0.15 + sub2 × 0.15 + sub3 × 0.20 + sub4 × 0.15 + sub5 × 0.20 + sub6 × 0.15)
```

---

### 维度四：风险分散 `risk_dispersion`（权重 20%）

**第一性原理**：风险能被任意拆分、全球自由匹配给最愿意/最合适承担的人。衍生品越丰富、资本跨境流动越自由，风险配置效率越高。

**必须采集的指标**：

| raw_indicators 字段 | 含义 | 单位 | 获取方式 | 获取类型 |
|---------------------|------|------|---------|---------|
| `derivatives_depth` | 衍生品市场深度（期权+期货名义价值/GDP） | 0-1 | BIS / 交易所年报 | 搜索整理 |
| `options_available` | 指数期权市场是否可用 | boolean | 交易所产品列表 | 搜索整理 |
| `capital_flow_freedom` | 资本跨境流动自由度 | 0-1 | IMF AREAER / 世界银行 | 搜索整理 |
| `foreign_ownership_limit` | 外资持股上限比例 | 0-1 | 各国证券法规 | 搜索整理 |
| `etf_variety` | 跨境ETF/基金产品丰富度 | 0-1 | Bloomberg ETF数据库 | 搜索整理 |
| `correlation_with_global` | 与全球市场（MSCI World）相关系数 | 0-1 | 月度收益率相关系数 | API可算 |

**评分公式**：

```
sub1 = derivatives_depth × 100
sub2 = options_available ? 100 : 20
sub3 = capital_flow_freedom × 100
sub4 = foreign_ownership_limit × 100
sub5 = etf_variety × 100

// 与全球相关性（适度最好）：0.5-0.7=最优(80-100), >0.9=60(太同步), <0.3=50(太孤立)
if correlation_with_global >= 0.4 && correlation_with_global <= 0.75:
    sub6 = 90
elif correlation_with_global < 0.4:
    sub6 = 50
else:
    sub6 = clamp(130 - correlation_with_global × 70, 40, 90)

risk_dispersion.score = round(sub1 × 0.20 + sub2 × 0.15 + sub3 × 0.20 + sub4 × 0.15 + sub5 × 0.15 + sub6 × 0.15)
```

---

### 维度五：产权执行 `property_rights`（权重 20%）

**第一性原理**：证券纸上权利100%可兑现。法治、退市机制、欺诈零容忍、司法独立、可追责——这些是市场存在的根基。

**必须采集的指标**：

| raw_indicators 字段 | 含义 | 单位 | 获取方式 | 获取类型 |
|---------------------|------|------|---------|---------|
| `rule_of_law_index` | 法治指数 | 0-1 | 世界银行 WGI | 搜索整理 |
| `judicial_independence` | 司法独立评级 | 0-1 | WEF 全球竞争力报告 | 搜索整理 |
| `fraud_enforcement_rate` | 欺诈案件查处/起诉率 | 0-1 | 证监会/SEC 年度执法报告 | 搜索整理 |
| `delisting_rate` | 年度退市率（有进有出=健康） | 小数 | 交易所年度统计 | 搜索整理 |
| `investor_protection_index` | 投资者保护指数 | 0-10 | 世界银行 Doing Business | 搜索整理 |
| `accounting_standards` | 会计准则评级 | 0-1 | IFRS基金会（1=IFRS, 0.5=趋同, 0=独立） | 搜索整理 |

**评分公式**：

```
sub1 = rule_of_law_index × 100
sub2 = judicial_independence × 100
sub3 = fraud_enforcement_rate × 100

// 退市率：4-8%=100(健康新陈代谢), 1-3%=70, <0.5%=30(僵尸市场), >10%=50(可能混乱)
if delisting_rate >= 0.04 && delisting_rate <= 0.08:
    sub4 = 100
elif delisting_rate >= 0.01:
    sub4 = 70
elif delisting_rate > 0:
    sub4 = 40
else:
    sub4 = 20

sub5 = investor_protection_index × 10    // 10→100, 5→50
sub6 = accounting_standards × 100         // 1=100, 0.5=50, 0=10

property_rights.score = round(sub1 × 0.20 + sub2 × 0.15 + sub3 × 0.15 + sub4 × 0.15 + sub5 × 0.20 + sub6 × 0.15)
```

---

## 部分市场参考值

以下为各维度的典型参考值（需 OpenClaw 搜索验证并更新）：

### 信息聚合

| 市场 | analyst_coverage | earnings_surprise_std | short_selling | price_impact_ratio | market_efficiency |
|------|-----------------|----------------------|--------------|-------------------|------------------|
| us_sp500 | 0.95 | 0.020 | true | 0.35 | 0.75 |
| jp | 0.75 | 0.035 | true | 0.50 | 0.60 |
| gb | 0.80 | 0.025 | true | 0.45 | 0.65 |
| de | 0.80 | 0.025 | true | 0.45 | 0.65 |
| fr | 0.75 | 0.030 | true | 0.50 | 0.60 |
| au | 0.70 | 0.030 | true | 0.50 | 0.55 |
| ca | 0.75 | 0.028 | true | 0.45 | 0.60 |
| cn_ashare | 0.55 | 0.060 | true(限融券) | 0.65 | 0.35 |
| cn_hk | 0.70 | 0.035 | true | 0.50 | 0.55 |
| kr | 0.60 | 0.040 | true(受限) | 0.55 | 0.45 |
| tw | 0.65 | 0.038 | true(受限) | 0.55 | 0.45 |
| in | 0.50 | 0.050 | true(受限) | 0.60 | 0.40 |
| vn | 0.20 | 0.080 | false | 0.80 | 0.20 |
| br | 0.50 | 0.055 | true | 0.60 | 0.40 |

### 交易成本

| 市场 | commission_rate | spread_bps | settlement | withholding_tax | cg_tax | amihud |
|------|----------------|------------|------------|-----------------|--------|--------|
| us_sp500 | 0.0005 | 3 | 1 | 0.10 | 0.00 | 1e-11 |
| jp | 0.0010 | 5 | 2 | 0.15 | 0.20 | 5e-10 |
| gb | 0.0010 | 4 | 2 | 0.00 | 0.20 | 3e-10 |
| de | 0.0012 | 5 | 2 | 0.15 | 0.26 | 4e-10 |
| fr | 0.0012 | 5 | 2 | 0.15 | 0.30 | 5e-10 |
| au | 0.0010 | 5 | 2 | 0.15 | 0.00 | 4e-10 |
| ca | 0.0010 | 4 | 2 | 0.15 | 0.00 | 3e-10 |
| cn_ashare | 0.0003 | 8 | 1 | 0.10 | 0.00 | 2e-9 |
| cn_hk | 0.0008 | 5 | 2 | 0.00 | 0.00 | 3e-10 |
| kr | 0.0015 | 8 | 2 | 0.15 | 0.22 | 8e-10 |
| tw | 0.0015 | 7 | 2 | 0.20 | 0.00 | 6e-10 |
| in | 0.0020 | 10 | 2 | 0.15 | 0.10 | 1.5e-9 |
| vn | 0.0030 | 35 | 3 | 0.05 | 0.00 | 5e-8 |
| br | 0.0020 | 12 | 2 | 0.00 | 0.15 | 2e-9 |

### 激励对齐

| 市场 | activism | board_indep | rpt_control | short_selling | earnings_quality | insider_enforcement |
|------|----------|-------------|-------------|--------------|-----------------|-------------------|
| us_sp500 | 0.90 | 0.85 | 0.85 | true | 0.85 | 0.90 |
| jp | 0.50 | 0.60 | 0.70 | true | 0.75 | 0.65 |
| gb | 0.80 | 0.80 | 0.85 | true | 0.80 | 0.80 |
| de | 0.70 | 0.75 | 0.80 | true | 0.80 | 0.75 |
| fr | 0.65 | 0.70 | 0.75 | true | 0.75 | 0.70 |
| au | 0.70 | 0.75 | 0.80 | true | 0.78 | 0.75 |
| ca | 0.75 | 0.80 | 0.80 | true | 0.80 | 0.78 |
| cn_ashare | 0.15 | 0.40 | 0.35 | true(限融券) | 0.40 | 0.30 |
| cn_hk | 0.55 | 0.65 | 0.65 | true | 0.65 | 0.60 |
| kr | 0.35 | 0.55 | 0.60 | true(受限) | 0.55 | 0.50 |
| tw | 0.40 | 0.55 | 0.55 | true(受限) | 0.55 | 0.50 |
| in | 0.25 | 0.45 | 0.40 | true(受限) | 0.45 | 0.35 |
| vn | 0.05 | 0.25 | 0.20 | false | 0.25 | 0.15 |
| br | 0.30 | 0.45 | 0.45 | true | 0.45 | 0.40 |

### 风险分散

| 市场 | derivatives_depth | options_available | capital_flow | foreign_limit | etf_variety | correlation_global |
|------|------------------|------------------|-------------|--------------|-------------|-------------------|
| us_sp500 | 0.95 | true | 1.0 | 1.0 | 0.95 | 0.85 |
| jp | 0.75 | true | 0.95 | 1.0 | 0.80 | 0.60 |
| gb | 0.80 | true | 0.95 | 1.0 | 0.85 | 0.70 |
| de | 0.75 | true | 0.95 | 1.0 | 0.85 | 0.72 |
| fr | 0.70 | true | 0.95 | 1.0 | 0.80 | 0.70 |
| au | 0.60 | true | 0.90 | 1.0 | 0.70 | 0.60 |
| ca | 0.65 | true | 0.95 | 1.0 | 0.75 | 0.72 |
| cn_ashare | 0.30 | true(受限) | 0.50 | 0.30 | 0.50 | 0.25 |
| cn_hk | 0.55 | true | 0.90 | 1.0 | 0.70 | 0.55 |
| kr | 0.50 | true | 0.70 | 1.0 | 0.60 | 0.55 |
| tw | 0.50 | true | 0.70 | 1.0 | 0.60 | 0.60 |
| in | 0.35 | true(受限) | 0.55 | 0.30 | 0.45 | 0.35 |
| vn | 0.05 | false | 0.35 | 0.49 | 0.15 | 0.25 |
| br | 0.40 | true | 0.65 | 1.0 | 0.50 | 0.50 |

### 产权执行

| 市场 | rule_of_law | judicial_indep | fraud_enforce | delisting_rate | investor_protect | accounting |
|------|------------|----------------|---------------|----------------|-----------------|------------|
| us_sp500 | 0.90 | 0.88 | 0.90 | 0.055 | 8.3 | 1.0 |
| jp | 0.85 | 0.80 | 0.70 | 0.020 | 7.1 | 1.0 |
| gb | 0.90 | 0.88 | 0.80 | 0.035 | 8.0 | 1.0 |
| de | 0.92 | 0.90 | 0.80 | 0.030 | 8.2 | 1.0 |
| fr | 0.87 | 0.82 | 0.75 | 0.025 | 7.8 | 1.0 |
| au | 0.93 | 0.90 | 0.80 | 0.040 | 8.2 | 1.0 |
| ca | 0.93 | 0.90 | 0.82 | 0.040 | 8.3 | 1.0 |
| cn_ashare | 0.50 | 0.35 | 0.30 | 0.005 | 4.6 | 0.5 |
| cn_hk | 0.80 | 0.78 | 0.65 | 0.015 | 7.3 | 1.0 |
| kr | 0.72 | 0.65 | 0.55 | 0.010 | 6.2 | 1.0 |
| tw | 0.75 | 0.70 | 0.55 | 0.008 | 7.0 | 1.0 |
| in | 0.55 | 0.50 | 0.40 | 0.015 | 4.5 | 0.5 |
| vn | 0.40 | 0.30 | 0.20 | 0.002 | 3.5 | 0.3 |
| br | 0.50 | 0.45 | 0.45 | 0.008 | 5.2 | 0.5 |

---

## 市场标识符列表

以下 14 个标识符已注册，ValueScope 会自动匹配国旗和元数据：

| 标识符 | 市场 | 代表指数 | 推荐数据源 |
|--------|------|---------|-----------|
| `us_sp500` | 美国 | S&P 500 | yfinance |
| `jp` | 日本 | 日经225 | yfinance |
| `gb` | 英国 | FTSE 100 | yfinance |
| `de` | 德国 | DAX | yfinance |
| `fr` | 法国 | CAC 40 | yfinance |
| `au` | 澳洲 | ASX 200 | yfinance |
| `ca` | 加拿大 | S&P/TSX | yfinance |
| `cn_ashare` | A股 | 沪深300 | AKShare |
| `cn_hk` | 港股 | 恒生指数 | AKShare |
| `kr` | 韩国 | KOSPI | yfinance |
| `tw` | 台湾 | 加权指数 | yfinance |
| `in` | 印度 | Nifty 50 | yfinance |
| `vn` | 越南 | VN-Index | yfinance |
| `br` | 巴西 | Bovespa | yfinance |

---

## 工作流程

```
1. OpenClaw 每日收盘后执行采集任务
2. 采集各市场 raw_indicators 原始数据
3. 按上述公式计算各维度 score（0-100）
4. 加权汇总为 fish_score（五维等权）
5. 生成 data/daily/YYYY-MM-DD.json
6. git commit & push
7. GitHub Actions 自动触发构建
8. ValueScope 看板更新完成
```

## 采集频率建议

| 维度 | 建议频率 | 原因 |
|------|---------|------|
| info_aggregation | 每季度 | 市场效率指标变化缓慢 |
| transaction_cost | 每季度 | 佣金/税率/交割规则极少变化 |
| incentive_alignment | 每季度 | 治理结构/执法力度季度更新 |
| risk_dispersion | 每季度 | 衍生品/资本流动规则缓慢变化 |
| property_rights | 每半年 | 法治/司法/制度变化最慢 |

**实际操作**：所有维度都是慢变量，建议每季度全量采集一次即可。每日采集时可沿用上一次的计算结果。

## 数据校验

ValueScope 构建时会自动校验：
- 日期不一致（文件名 vs 内容）：跳过该文件并警告
- 缺少必填字段：跳过该条市场记录并警告
- 未知市场标识符：正常渲染，警告

## 本地测试

可用 seed 脚本生成模拟数据：

```bash
npm run seed    # 生成 90 天模拟数据到 data/daily/
npm run dev     # 本地预览
```
