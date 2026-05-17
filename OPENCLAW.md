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
        "profit_effect": { "score": 85, "weight": 0.25 },
        "valuation": { "score": 70, "weight": 0.20 },
        "scale_liquidity": { "score": 75, "weight": 0.10 },
        "fundamentals": { "score": 68, "weight": 0.15 },
        "institutional": { "score": 60, "weight": 0.15 },
        "risk_penalty": { "score": 30, "weight": 0.15 }
      },
      "raw_indicators": {
        "cagr_5y": 0.082,
        "sharpe_3y": 0.95,
        "positive_year_ratio_10y": 0.7,
        "dividend_buyback_yield": 0.035,
        "drawdown_recovery_months": 8,
        "max_drawdown_10y": -0.22,
        "pe_ttm": 12.5,
        "pe_percentile": 0.45,
        "pb_percentile": 0.50,
        "cape_shiller_pe": 16.8,
        "equity_risk_premium": 0.035,
        "bond_equity_yield_ratio": 1.8,
        "ev_ebitda": 11.2,
        "free_float_market_cap_usd": 1.0e12,
        "daily_volume_usd": 8.5e9,
        "turnover_rate": 0.012,
        "bid_ask_spread_bps": 6.5,
        "amihud_illiquidity": 2.3e-9,
        "gdp_growth_yoy": 0.025,
        "manufacturing_pmi": 51.2,
        "services_pmi": 52.8,
        "cpi_yoy": 0.032,
        "real_interest_rate": 0.003,
        "earnings_growth_yoy": 0.08,
        "credit_spread": 0.012,
        "unemployment_rate": 0.038,
        "foreign_ownership_limit": 1.0,
        "capital_flow_freedom": 0.9,
        "etf_available": true,
        "settlement_days": 2,
        "withholding_tax": 0.15,
        "investor_protection_index": 6.2,
        "accounting_standards": 1.0,
        "market_transparency": 0.70,
        "dual_listing_accessibility": true,
        "volatility_20d": 0.18,
        "max_drawdown_10y": -0.30,
        "currency_devaluation_5y": -0.10,
        "sovereign_cds_spread": 35,
        "correlation_with_us": 0.50,
        "geopolitical_risk_index": 55,
        "capital_control_risk": 0.05
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
| `dimensions` | object | 六个维度的评分和权重，见下方 |
| `raw_indicators` | object | 原始指标数据，尽量完整填写 |

### dimensions 六维评分

每个维度包含 `score`（0-100）和 `weight`（固定权重）：

| 维度 | 字段名 | 固定权重 | 说明 |
|------|--------|---------|------|
| 赚钱效应 | `profit_effect` | 0.25 | 市场是否长期奖励持有者 |
| 估值性价比 | `valuation` | 0.20 | 当前估值在历史中的便宜程度 |
| 经济基本面 | `fundamentals` | 0.15 | 宏观经济和企业盈利支撑 |
| 制度可进入性 | `institutional` | 0.15 | 制度是否保护投资者、市场是否友好 |
| 风险惩罚 | `risk_penalty` | 0.15 | 结构性风险（汇率/主权/地缘/资本管制） |
| 规模流动性 | `scale_liquidity` | 0.10 | 交易成本和市场容量 |

### fish_score 计算规则

```
fish_score = round(
  profit_effect.score     × 0.25
+ valuation.score         × 0.20
+ fundamentals.score      × 0.15
+ institutional.score     × 0.15
+ risk_penalty.score      × 0.15
+ scale_liquidity.score   × 0.10
)
```

注意：`risk_penalty` 得分越高代表惩罚越大（风险越高），所以高风险会拉低总分。

---

## 六维评分：采集指标与计算公式

以下详细说明每个维度需要采集哪些原始指标、从哪里获取、以及如何将原始数据换算为 0-100 的维度评分。

### 获取类型说明

每个指标标注了**获取类型**，共两类：

| 获取类型 | 含义 | 示例 |
|---------|------|------|
| **API可取** | 可通过 yfinance / AKShare / FRED 等接口直接获取原始数据 | PE_TTM、成交量、汇率 |
| **API可算** | 基于API获取的数据进行二次计算即可得出 | CAGR、夏普比率、波动率、相关系数、分位数 |
| **搜索整理** | 无现成API，需要通过网络搜索、查找官方报告、人工整理 | 投资者保护指数、会计准则评级、地缘风险指数、回购收益率 |

**重点说明**：标注为"搜索整理"的指标没有标准化的数据接口，OpenClaw 需要通过搜索各国统计局、央行、世界银行、IMF、MSCI、S&P 等权威来源来获取。这类指标变化缓慢（制度/评级类通常季度或年度更新），不需要每日搜索，建议**缓存上次结果，按频率定期刷新**。

### 指标获取类型汇总

| 获取类型 | 指标数 | 占比 |
|---------|--------|------|
| API可取/可算 | 20 | 50% |
| 搜索整理 | 20 | 50% |

**搜索整理类指标清单**（无现成API，需搜索获取）：
- `dividend_buyback_yield` — 回购数据需搜索整理
- `cape_shiller_pe` — 部分市场有现成数据（如 multpl.com 提供美股），其余需计算
- `ev_ebitda` — 需从 Bloomberg 或财经网站获取
- `free_float_market_cap_usd` — 需查交易所或指数提供商
- `bid_ask_spread_bps` — 需从做市商数据或交易所统计获取
- `manufacturing_pmi` / `services_pmi` — 各国统计局官网
- `earnings_growth_yoy` — 指数EPS数据需从财经数据商获取
- `credit_spread` — FRED有美国数据，其他国家需搜索
- `unemployment_rate` — 各国统计局官网
- **制度维度全部 9 个指标** — 均需搜索各国法规、世界银行/IMF数据库
- `sovereign_cds_spread` — 需从 Bloomberg 或金融数据商获取
- `geopolitical_risk_index` — 需搜索 GPR Index 或定性评估
- `capital_control_risk` — 需搜索 IMF AREAER 数据库

### 维度一：赚钱效应 `profit_effect`（权重 25%）

**含义**：市场是否长期奖励持有者——是不是一个正和游戏。基于第一性原理，关注长期奖惩机制，而非短期涨跌。

**必须采集的指标**：

| raw_indicators 字段 | 含义 | 单位 | 获取方式 | 获取类型 |
|---------------------|------|------|---------|---------|
| `cagr_5y` | 5年年化复合收益率 | 小数 | (当前价/5年前价)^(1/5) - 1 | API可算 |
| `sharpe_3y` | 3年夏普比率 | 比值 | (年化收益 - 无风险利率) / 年化波动率 | API可算 |
| `positive_year_ratio_10y` | 过去10年正收益年份占比 | 0-1 | 统计10个年度收益中正数占比 | API可算 |
| `dividend_buyback_yield` | 股息+回购收益率(TTM) | 小数 | (分红+回购) / 总市值 | 搜索整理 |
| `drawdown_recovery_months` | 最近一次≥15%回撤的恢复月数 | 月 | 从回撤低点回到前高的月数 | API可算 |
| `max_drawdown_10y` | 近10年最大回撤 | 小数（负数） | 10年内最高点到最低点的跌幅 | API可算 |

**评分公式**：

```
// 5年CAGR：8%=70, 12%=90, <0%=5, >15%=100
sub1 = clamp(cagr_5y × 600 + 22, 0, 100)

// 夏普比率：0.5=50, 1.0=80, 1.5+=100, <0=5
sub2 = clamp(sharpe_3y × 66 + 17, 0, 100)

// 正收益年份占比：直接映射
sub3 = positive_year_ratio_10y × 100

// 股息+回购收益率：3%=50, 5%=80, >7%=100
sub4 = clamp(dividend_buyback_yield × 1400, 0, 100)

// 回撤恢复速度：6个月=90, 12个月=60, >24个月=20, <3个月=100
if drawdown_recovery_months <= 3:
    sub5 = 100
elif drawdown_recovery_months <= 6:
    sub5 = 100 - (drawdown_recovery_months - 3) × 3.3
elif drawdown_recovery_months <= 12:
    sub5 = 90 - (drawdown_recovery_months - 6) × 5
elif drawdown_recovery_months <= 24:
    sub5 = 60 - (drawdown_recovery_months - 12) × 3.3
else:
    sub5 = 20

// 10年最大回撤（反向）：-15%=85, -30%=50, >-50%=10
sub6 = clamp(100 + max_drawdown_10y × 170, 10, 100)

profit_effect.score = round(sub1 × 0.25 + sub2 × 0.20 + sub3 × 0.15 + sub4 × 0.15 + sub5 × 0.15 + sub6 × 0.10)
```

**特殊情况**：
- 历史不足10年的市场，`positive_year_ratio_10y` 改为 `positive_year_ratio_5y`

---

### 维度二：估值性价比 `valuation`（权重 20%）

**含义**：当前价格相对于内在价值有多便宜。基于第一性原理，关注资产是否被低估，而非短期价格波动。

**必须采集的指标**：

| raw_indicators 字段 | 含义 | 单位 | 获取方式 | 获取类型 |
|---------------------|------|------|---------|---------|
| `pe_ttm` | 滚动市盈率 (TTM) | 倍 | 指数PE-TTM | API可取 |
| `pe_percentile` | PE在近10年中的分位 | 0-1 | PE_TTM vs 近10年PE序列计算百分位 | API可算 |
| `pb_percentile` | PB在近10年中的分位 | 0-1 | PB vs 近10年PB序列计算百分位 | API可算 |
| `cape_shiller_pe` | 席勒周期调整PE（10年平均盈利） | 倍 | 指数价格 / 过去10年通胀调整后平均EPS | 搜索整理 |
| `equity_risk_premium` | 股权风险溢价 (ERP) | 小数 | 1/PE_TTM - 10年期国债收益率 | API可算 |
| `bond_equity_yield_ratio` | 股债收益比 = 股息率 / 国债收益率 | 比值 | dividend_buyback_yield / 10Y国债收益率 | API可算 |
| `ev_ebitda` | EV/EBITDA（不受资本结构影响） | 倍 | 企业价值 / 息税折旧前利润 | 搜索整理 |

**评分公式**：

```
// PE分位越低越便宜，分数越高
sub1 = (1 - pe_percentile) × 100
// PB分位同理
sub2 = (1 - pb_percentile) × 100
// CAPE越高说明越贵，用倒数+历史对比：CAPE<15=90, 15-20=70, 20-25=50, >30=20
sub3 = clamp(130 - cape_shiller_pe × 3.5, 10, 100)
// ERP越高说明股票相对债券越有吸引力：3%=65, 5%=85, >6%=100, <1%=10
sub4 = clamp(equity_risk_premium × 1600 + 15, 0, 100)
// 股债收益比：>2=100(股票远优于债券), 1.5=75, 1.0=50, <0.5=10
sub5 = clamp(bond_equity_yield_ratio × 50, 10, 100)
// EV/EBITDA越低越便宜：<8=90, 10=65, 15=40, >20=15
sub6 = clamp(140 - ev_ebitda × 6, 10, 100)

valuation.score = round(sub1 × 0.20 + sub2 × 0.15 + sub3 × 0.20 + sub4 × 0.20 + sub5 × 0.15 + sub6 × 0.10)
```

**特殊情况**：
- 新兴市场 EV/EBITDA 数据可能缺失，缺省时 `sub6` 权重分配给 `sub1` 和 `sub3`

---

### 维度三：规模流动性 `scale_liquidity`（权重 10%）

**含义**：我的钱能不能顺利进去、顺利出来，且不影响价格。基于第一性原理，关注的是交易摩擦成本，而不仅仅是市场规模。

**必须采集的指标**：

| raw_indicators 字段 | 含义 | 单位 | 获取方式 | 获取类型 |
|---------------------|------|------|---------|---------|
| `free_float_market_cap_usd` | 自由流通市值（美元） | USD | 指数成分股自由流通市值汇总 | 搜索整理 |
| `daily_volume_usd` | 日均成交额（美元），取近20日均值 | USD | 近20个交易日成交额均值 | API可取 |
| `turnover_rate` | 日换手率 | 小数 | 当日成交额 / 自由流通市值 | API可算 |
| `bid_ask_spread_bps` | 买卖价差（基点） | bps | (卖一 - 买一) / 中间价 × 10000 | 搜索整理 |
| `amihud_illiquidity` | Amihud非流动性指标 | 小数 | 近20日均值(｜日收益率｜/ 成交额) | API可算 |

**评分公式**：

```
// 自由流通市值：>1万亿=100, 5000亿=75, 1000亿=50, <500亿<25
sub1 = clamp(log10(free_float_market_cap_usd) - 9, 0, 4) × 25

// 日均成交额：>500亿=100, 100亿=60, <50亿<40
sub2 = clamp(log10(daily_volume_usd) - 8, 0, 3) × 33

// 买卖价差（反向）：越小越好。<5bps=100, 10bps=70, 20bps=40, >50bps=10
sub3 = clamp(120 - bid_ask_spread_bps × 2.2, 10, 100)

// Amihud非流动性（反向）：越小越好。<1e-10=100, 1e-8=60, >1e-6=10
sub4 = clamp(100 - log10(amihud_illiquidity + 1e-12) × 20 - 60, 10, 100)

// 换手率：合理区间最好，过低=没人玩，过高=投机过重
if turnover_rate < 0.002:
    sub5 = 30   // 极度不活跃
elif turnover_rate < 0.01:
    sub5 = 60   // 正常偏低
elif turnover_rate <= 0.03:
    sub5 = 90   // 健康活跃
else:
    sub5 = 50   // 过度投机

scale_liquidity.score = round(sub1 × 0.25 + sub2 × 0.20 + sub3 × 0.20 + sub4 × 0.20 + sub5 × 0.15)
```

**说明**：
- `bid_ask_spread_bps` 和 `amihud_illiquidity` 是衡量"交易成本"的核心指标，直接回答"买卖会不会被打飞"
- 这两个指标短期稳定，建议每周采集一次

---

### 维度四：经济基本面 `fundamentals`（权重 15%）

**含义**：这个国家的经济引擎是否在为股市创造真实价值。基于第一性原理，关注经济创造价值的底层能力。

**必须采集的指标**：

| raw_indicators 字段 | 含义 | 单位 | 获取方式 | 获取类型 |
|---------------------|------|------|---------|---------|
| `gdp_growth_yoy` | GDP同比增速（最近季度） | 小数 | 各国统计局 / FRED | API可取 |
| `manufacturing_pmi` | 制造业PMI（最新月） | 指数 | 各国统计局 | 搜索整理 |
| `services_pmi` | 服务业PMI（最新月） | 指数 | 各国统计局 | 搜索整理 |
| `cpi_yoy` | CPI同比 | 小数 | 各国统计局 | API可取 |
| `real_interest_rate` | 实际利率 = 名义利率 - CPI | 小数 | 央行政策利率 - CPI同比 | API可算 |
| `earnings_growth_yoy` | 指数成分股盈利同比增速 | 小数 | 指数EPS-TTM同比 | 搜索整理 |
| `credit_spread` | 信用利差 = 企业债收益率 - 国债收益率 | 小数 | Bloomberg / FRED | 搜索整理 |
| `unemployment_rate` | 失业率 | 小数 | 各国统计局 | 搜索整理 |

**评分公式**：

```
// GDP增速：5%=70, 8%=90, 0%=40, <0%=10
sub1 = clamp(gdp_growth_yoy × 800 + 30, 0, 100)

// 制造业PMI：50=50, 55=75, 60=100, 45=25
sub2 = clamp((manufacturing_pmi - 40) × 5, 0, 100)

// 服务业PMI：同理
sub3 = clamp((services_pmi - 40) × 5, 0, 100)

// CPI：2-3%最优区间
if cpi_yoy < 0.01:
    sub4 = 60   // 通缩也不好
elif cpi_yoy <= 0.03:
    sub4 = 70 + (0.03 - cpi_yoy) × 1000
else:
    sub4 = clamp(100 - (cpi_yoy - 0.03) × 2000, 0, 70)

// 实际利率（负利率=刺激经济但有问题，适度正利率=健康）：-2%=40, 1%=80, 3%=100, >5%=50
if real_interest_rate < -0.02:
    sub5 = 40
elif real_interest_rate < 0:
    sub5 = 50
elif real_interest_rate <= 0.03:
    sub5 = 70 + real_interest_rate × 1000
else:
    sub5 = clamp(100 - (real_interest_rate - 0.03) × 2500, 40, 100)

// 盈利增长：10%=60, 20%=80, >30%=100, <0%=15
sub6 = clamp(earnings_growth_yoy × 300 + 30, 0, 100)

// 信用利差（反向）：越小=市场越有信心。1%=80, 2%=60, >4%=20
sub7 = clamp(100 - credit_spread × 2000, 10, 100)

// 失业率（反向）：4%=75, 6%=50, >10%=15, <3%=90
sub8 = clamp(110 - unemployment_rate × 1000, 10, 100)

fundamentals.score = round(sub1 × 0.15 + sub2 × 0.10 + sub3 × 0.10 + sub4 × 0.10 + sub5 × 0.10 + sub6 × 0.20 + sub7 × 0.15 + sub8 × 0.10)
```

**特殊情况**：
- 无服务业PMI数据的市场（如越南），`sub3` 权重分配给 `sub2`

---

### 维度五：制度可进入性 `institutional`（权重 15%）

**含义**：这个市场对资本是否友好，制度是否保护投资者。基于第一性原理，关注的不只是"能不能买"，更是"买了以后有没有制度保障"。

**必须采集的指标**：

| raw_indicators 字段 | 含义 | 单位 | 获取方式 | 获取类型 |
|---------------------|------|------|---------|---------|
| `foreign_ownership_limit` | 外资持股上限比例 | 0-1 | 查各国证券法规 | 搜索整理 |
| `capital_flow_freedom` | 资本流动自由度评级 | 0-1 | IMF / 世界银行指数 | 搜索整理 |
| `etf_available` | 是否有跟踪该指数的跨境ETF | boolean | 查 Bloomberg / ETF数据库 | 搜索整理 |
| `settlement_days` | 交割周期（T+N） | 天 | 交易所规则 | 搜索整理 |
| `withholding_tax` | 股息预扣税率 | 小数 | 各国税法 | 搜索整理 |
| `investor_protection_index` | 投资者保护指数 | 0-10 | 世界银行 Doing Business / WGI | 搜索整理 |
| `accounting_standards` | 会计准则评级 | 0-1 | IFRS基金会（1=完全采用IFRS，0.5=本地GAAP趋同，0=本地独立标准） | 搜索整理 |
| `market_transparency` | 信息披露透明度 | 0-1 | MSCI ESG评级 / 透明国际指数 | 搜索整理 |
| `dual_listing_accessibility` | 是否有存托凭证/双重上市渠道 | boolean | ADR/GDR数据库 | 搜索整理 |

**评分公式**：

```
sub1 = foreign_ownership_limit × 100        // 100%=100, 30%=30
sub2 = capital_flow_freedom × 100           // 1=100, 0.5=50
sub3 = etf_available ? 100 : 20             // 有ETF=100, 无=20
sub4 = settlement_days <= 2 ? 100 :         // T+0/T+1=100
        settlement_days <= 3 ? 70 : 40      // T+2=70, T+3+=40
sub5 = (1 - withholding_tax) × 100          // 0%=100, 20%=80, 30%=70
sub6 = investor_protection_index × 10       // 10→100, 5→50, 2→20
sub7 = accounting_standards × 100           // 1(IFRS)=100, 0.5=50, 0=10
sub8 = market_transparency × 100            // 1=100, 0.5=50
sub9 = dual_listing_accessibility ? 100 : 30 // 有ADR/双重上市=100

institutional.score = round(sub1 × 0.12 + sub2 × 0.12 + sub3 × 0.08 + sub4 × 0.08 + sub5 × 0.10 + sub6 × 0.15 + sub7 × 0.12 + sub8 × 0.13 + sub9 × 0.10)
```

**说明**：该维度短期内变化极小（制度不会每天变），建议**每季度更新一次**即可。

**部分市场参考值**：

| 市场 | foreign_ownership_limit | capital_flow_freedom | etf_available | settlement_days | withholding_tax | investor_protection | accounting | transparency | dual_listing |
|------|------------------------|---------------------|---------------|-----------------|-----------------|--------------------|------------|-------------|-------------|
| us_sp500 | 1.0 | 1.0 | true | 1 | 0.10 | 8.3 | 1.0 | 0.95 | true |
| us_nasdaq | 1.0 | 1.0 | true | 1 | 0.10 | 8.3 | 1.0 | 0.95 | true |
| jp | 1.0 | 0.95 | true | 2 | 0.15 | 7.1 | 1.0 | 0.85 | true |
| gb | 1.0 | 0.95 | true | 2 | 0.00 | 8.0 | 1.0 | 0.90 | true |
| de | 1.0 | 0.95 | true | 2 | 0.15 | 8.2 | 1.0 | 0.90 | true |
| fr | 1.0 | 0.95 | true | 2 | 0.15 | 7.8 | 1.0 | 0.85 | true |
| au | 1.0 | 0.90 | true | 2 | 0.15 | 8.2 | 1.0 | 0.90 | true |
| ca | 1.0 | 0.95 | true | 2 | 0.15 | 8.3 | 1.0 | 0.90 | true |
| cn_ashare | 0.30 | 0.50 | true | 1 | 0.10 | 4.6 | 0.5 | 0.45 | true |
| cn_hk | 1.0 | 0.90 | true | 2 | 0.00 | 7.3 | 1.0 | 0.80 | true |
| kr | 1.0 | 0.70 | true | 2 | 0.15 | 6.2 | 1.0 | 0.70 | true |
| tw | 1.0 | 0.70 | true | 2 | 0.20 | 7.0 | 1.0 | 0.75 | true |
| in | 0.30 | 0.55 | true | 2 | 0.15 | 4.5 | 0.5 | 0.55 | true |
| vn | 0.49 | 0.35 | false | 3 | 0.05 | 3.5 | 0.3 | 0.30 | false |
| br | 1.0 | 0.65 | true | 2 | 0.00 | 5.2 | 0.5 | 0.50 | true |

---

### 维度六：风险惩罚 `risk_penalty`（权重 15%）

**含义**：这个市场会不会坑我——结构性风险，而非短期波动。基于第一性原理，关注的是"看不见的坑"：汇率陷阱、主权违约、资本冻结、地缘冲突等。

**必须采集的指标**：

| raw_indicators 字段 | 含义 | 单位 | 获取方式 | 获取类型 |
|---------------------|------|------|---------|---------|
| `max_drawdown_10y` | 近10年最大回撤 | 小数（负数） | 10年内最高点到最低点的跌幅 | API可算 |
| `currency_devaluation_5y` | 货币5年累计贬值幅度 | 小数 | (当前汇率 / 5年前汇率) - 1，正数=贬值 | API可算 |
| `sovereign_cds_spread` | 主权CDS利差 | bps | 5年期主权CDS报价 | 搜索整理 |
| `correlation_with_us` | 与美股S&P500的3年相关系数 | 0-1 | 月度收益率相关系数 | API可算 |
| `geopolitical_risk_index` | 地缘政治风险指数 | 0-100 | Caldwell-Iacoviello GPR Index / 定性评估 | 搜索整理 |
| `capital_control_risk` | 资本管制风险 | 0-1 | 0=无管制自由进出，1=严格管制（如阿根廷式冻结） | 搜索整理 |

**评分公式**：

```
// 10年最大回撤：-15%=25, -30%=50, -50%=85, >-60%=100
sub1 = clamp(abs(max_drawdown_10y) × 170, 0, 100)

// 货币贬值（对境外投资者是隐形亏损）：0%=5, 10%=40, 30%=70, >50%=100
sub2 = clamp(currency_devaluation_5y × 200 + 5, 0, 100)

// 主权CDS利差：<50bps=10, 100bps=35, 300bps=70, >500bps=100
sub3 = clamp(sovereign_cds_spread × 0.2, 0, 100)

// 与美股相关性（反向）：越低=分散化价值越高=惩罚越轻
// >0.8=70(高相关,分散意义小), 0.5=35, <0.3=10
sub4 = clamp(correlation_with_us × 87.5, 10, 100)

// 地缘政治风险：直接映射
sub5 = geopolitical_risk_index

// 资本管制风险：直接映射
sub6 = capital_control_risk × 100

risk_penalty.score = round(sub1 × 0.20 + sub2 × 0.20 + sub3 × 0.20 + sub4 × 0.10 + sub5 × 0.15 + sub6 × 0.15)
```

**部分市场参考值**：

| 市场 | max_drawdown_10y | currency_devaluation_5y | sovereign_cds_spread | correlation_with_us | geopolitical_risk | capital_control_risk |
|------|-----------------|------------------------|---------------------|--------------------|--------------------|--------------------|
| us_sp500 | -0.34 | 0.00 | 20 | 1.00 | 15 | 0.00 |
| jp | -0.28 | -0.20 | 25 | 0.55 | 20 | 0.00 |
| gb | -0.30 | -0.15 | 22 | 0.70 | 15 | 0.00 |
| de | -0.32 | -0.18 | 25 | 0.72 | 20 | 0.00 |
| fr | -0.30 | -0.18 | 28 | 0.70 | 18 | 0.00 |
| au | -0.28 | -0.20 | 25 | 0.60 | 10 | 0.00 |
| ca | -0.30 | -0.15 | 22 | 0.75 | 10 | 0.00 |
| cn_ashare | -0.45 | -0.08 | 60 | 0.25 | 45 | 0.35 |
| cn_hk | -0.50 | -0.02 | 40 | 0.55 | 55 | 0.10 |
| kr | -0.30 | -0.10 | 35 | 0.50 | 55 | 0.05 |
| tw | -0.35 | -0.08 | 30 | 0.60 | 60 | 0.05 |
| in | -0.40 | -0.22 | 55 | 0.35 | 35 | 0.20 |
| vn | -0.45 | -0.15 | 120 | 0.25 | 30 | 0.30 |
| br | -0.50 | -0.30 | 100 | 0.50 | 25 | 0.10 |

**说明**：
- `currency_devaluation_5y` 为负数表示该货币相对美元升值，正数表示贬值
- `correlation_with_us` 中，低相关 ≠ 低风险，但对组合配置而言有分散化价值，因此反向映射

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

如果需要新增市场，使用未注册的标识符也可以，ValueScope 会正常渲染数据，只是不会显示国旗。

---

## 工作流程

```
1. OpenClaw 每日收盘后执行采集任务
2. 采集各市场 raw_indicators 原始数据
3. 按上述公式计算各维度 score（0-100）
4. 加权汇总为 fish_score
5. 生成 data/daily/YYYY-MM-DD.json
6. git commit & push
7. GitHub Actions 自动触发构建
8. ValueScope 看板更新完成
```

## 采集频率建议

| 维度 | 建议频率 | 原因 |
|------|---------|------|
| profit_effect | 每日 | 日内行情变化快 |
| valuation | 每日 | PE/PB 随股价变化 |
| scale_liquidity | 每周 | 市值和成交额短期稳定 |
| fundamentals | 每月 | GDP/PMI 等按月/季发布 |
| institutional | 每月 | 制度极少变化 |
| risk_penalty | 每日 | 波动率和回撤需要日频更新 |

**实际操作**：每日采集时，不变或低频的维度可以直接沿用上一次的计算结果，只更新高频指标。

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
