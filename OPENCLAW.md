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
      "fish_score": 82,
      "dimensions": {
        "profit_effect": { "score": 95, "weight": 0.30 },
        "valuation": { "score": 70, "weight": 0.20 },
        "scale_liquidity": { "score": 75, "weight": 0.15 },
        "fundamentals": { "score": 75, "weight": 0.15 },
        "institutional": { "score": 80, "weight": 0.10 },
        "risk_penalty": { "score": 10, "weight": 0.10 }
      },
      "raw_indicators": {
        "advance_decline_ratio": 0.68,
        "pct_above_200ma": 0.72,
        "ytd_return": 0.8397,
        "pe_percentile": 0.45,
        "pb_percentile": 0.50,
        "dividend_yield": 0.021,
        "gdp_growth": 0.025,
        "pmi": 51.2
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
| `raw_indicators` | object | 原始指标数据，字段可选，有什么填什么 |

### dimensions 六维评分

每个维度包含 `score`（0-100）和 `weight`（固定权重）：

| 维度 | 字段名 | 固定权重 | 说明 |
|------|--------|---------|------|
| 赚钱效应 | `profit_effect` | 0.30 | 涨跌比、市场宽度、YTD收益、创新高占比 |
| 估值性价比 | `valuation` | 0.20 | PE/PB分位、股息率、股债利差、风险溢价 |
| 规模流动性 | `scale_liquidity` | 0.15 | 市值规模、日均成交额、换手率 |
| 经济基本面 | `fundamentals` | 0.15 | GDP增速、PMI、通胀、利率环境、企业盈利 |
| 制度可进入性 | `institutional` | 0.10 | 外资开放度、资本流动自由度、工具完备性 |
| 风险惩罚 | `risk_penalty` | 0.10 | 波动率、回撤、政治风险、拥挤度 |

### fish_score 计算规则

```
fish_score = round(
  profit_effect.score × 0.30
  + valuation.score × 0.20
  + scale_liquidity.score × 0.15
  + fundamentals.score × 0.15
  + institutional.score × 0.10
  + risk_penalty.score × 0.10
)
```

注意：`risk_penalty` 得分越高代表惩罚越大（风险越高），所以高风险会拉低总分。

### raw_indicators 可选字段

以下字段可根据数据可得性填写，缺失不影响展示：

```
advance_decline_ratio  - 涨跌比（上涨家数/总家数）
pct_above_200ma       - 高于200日均线占比
ytd_return            - 年初至今收益率
pe_percentile         - PE历史分位（0-1）
pb_percentile         - PB历史分位（0-1）
dividend_yield        - 股息率
gdp_growth            - GDP同比增速
pmi                   - PMI指数
market_cap_usd        - 市值（美元）
daily_volume_usd      - 日均成交额（美元）
volatility_20d        - 20日年化波动率
max_drawdown          - 最大回撤
put_call_ratio        - 认沽认购比
net_inflow_weekly     - 周度资金净流入
```

也可以添加任意其他指标字段，ValueScope 不会报错。

## 市场标识符列表

以下 17 个标识符已注册，ValueScope 会自动匹配国旗和元数据：

| 标识符 | 市场 | 代表指数 | 推荐数据源 |
|--------|------|---------|-----------|
| `us_sp500` | 美国 | S&P 500 | yfinance |
| `us_nasdaq` | 美国 | 纳斯达克100 | yfinance |
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
| `gold` | 黄金 | XAUUSD | yfinance |
| `us_treasury` | 美债 | 10Y Treasury | FRED |

如果需要新增市场，使用未注册的标识符也可以，ValueScope 会正常渲染数据，只是不会显示国旗。

## 工作流程

```
1. OpenClaw 每日收盘后执行采集任务
2. 计算各市场六个维度的评分
3. 汇总为 fish_score
4. 生成 data/daily/YYYY-MM-DD.json
5. git commit & push
6. GitHub Actions 自动触发构建
7. ValueScope 看板更新完成
```

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
