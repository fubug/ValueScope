# ValueScope

全球市场鱼情看板 — 到有鱼的地方钓鱼。

基于芒格和段永平的投资哲学，对全球 16 个市场（17 个指数）每日评分，量化"鱼多不多"，辅助指数投资决策。

## 快速开始

```bash
npm install
npm run dev        # 本地开发
npm run build      # 构建静态站点
npm run preview    # 预览构建结果
npm run seed       # 生成 90 天模拟数据
```

## 数据格式

每日数据存放在 `data/daily/YYYY-MM-DD.json`，由 OpenClaw 采集后写入。

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
      "raw_indicators": { ... }
    }
  ]
}
```

### 六维评分框架

| 维度 | 权重 | 说明 |
|------|------|------|
| 赚钱效应 | 30% | 涨跌比、市场宽度、YTD收益 |
| 估值性价比 | 20% | PE/PB分位、股息率、风险溢价 |
| 规模流动性 | 15% | 市值、成交额、换手率 |
| 经济基本面 | 15% | GDP增速、PMI、利率环境 |
| 制度可进入性 | 10% | 外资开放度、资本流动、工具完备 |
| 风险惩罚 | 10% | 波动率、回撤、政治风险 |

### 覆盖市场

| 市场 | 指数 | 数据源 |
|------|------|--------|
| 美国 | S&P 500 / 纳斯达克100 | yfinance |
| 日本 | 日经225 | yfinance |
| 英国 | FTSE 100 | yfinance |
| 德国 | DAX | yfinance |
| 法国 | CAC 40 | yfinance |
| 澳洲 | ASX 200 | yfinance |
| 加拿大 | S&P/TSX | yfinance |
| A股 | 沪深300 / 中证500 | AKShare |
| 港股 | 恒生指数 / 恒生科技 | AKShare |
| 韩国 | KOSPI | yfinance |
| 台湾 | 加权指数 | yfinance |
| 印度 | Nifty 50 | yfinance |
| 越南 | VN-Index | yfinance |
| 巴西 | Bovespa | yfinance |
| 黄金 | XAUUSD | yfinance |
| 美债 | 10Y Treasury | FRED |

## 部署

推送到 main 分支后，GitHub Actions 自动构建并部署到 GitHub Pages。

## 免责声明

数据仅供参考，不构成投资建议。
