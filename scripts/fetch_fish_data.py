#!/usr/bin/env python3
"""
ValueScope 每日数据采集脚本 v3 — 五维评分体系

基于 OPENCLAW.md v2 规格，25 个慢变量指标，5 个等权维度。
数据源：static_data.json（主要）+ CNBC 实时价格（可选补充）。

评分维度（等权 0.20）：
  1. info_aggregation    — 信息聚合
  2. transaction_cost    — 交易成本
  3. incentive_alignment — 激励对齐
  4. risk_dispersion     — 风险分散
  5. property_rights     — 产权执行
"""

import json, os, re, sys, time, subprocess as sp
from datetime import datetime, timedelta
from pathlib import Path
import requests

# ============================================================
# 指标数据源参考（慢变量，建议每半年校验一次）
# ============================================================
# 数据主要来源于以下公开数据集和研究：
#   - World Bank: Worldwide Governance Indicators (rule_of_law, judicial_independence)
#   - World Bank: Doing Business / Business Ready (investor_protection_index)
#   - S&P/IFC: Global Corporate Governance Scoreboard (board_independence, rpt_control)
#   - OECD: Equity Market Regulation indicators (earnings_quality, fraud_enforcement)
#   - MSCIs: Market Classification Framework (derivatives_depth, foreign_ownership_limit)
#   - 各交易所官方: 佣金费率、结算周期、印花税/预扣税、做空规则
#   - IOSCO: Objectives and Principles of Securities Regulation (accounting_standards)
#   - 学术文献: Amihud (2002) illiquidity measure; correlation 来自 MSCI Barra
#
# ⚠️ 注意：这些指标为手动评估的近似值，不是实时API抓取的精确数据。
#   评分框架反映的是市场制度质量的相对排序，而非精确计量。
# ============================================================

# ============================================================
# 配置
# ============================================================

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / "data" / "daily"
STATIC_DATA_FILE = SCRIPT_DIR / "static_data.json"

DATA_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

DIM_KEYS = [
    "info_aggregation",
    "transaction_cost",
    "incentive_alignment",
    "risk_dispersion",
    "property_rights",
]

MARKETS = [
    {"market": "us_sp500", "market_name": "美国", "index_name": "S&P 500"},
    {"market": "jp",       "market_name": "日本", "index_name": "日经225"},
    {"market": "gb",       "market_name": "英国", "index_name": "FTSE 100"},
    {"market": "de",       "market_name": "德国", "index_name": "DAX"},
    {"market": "fr",       "market_name": "法国", "index_name": "CAC 40"},
    {"market": "au",       "market_name": "澳洲", "index_name": "ASX 200"},
    {"market": "ca",       "market_name": "加拿大", "index_name": "S&P/TSX"},
    {"market": "cn_ashare","market_name": "A股", "index_name": "沪深300"},
    {"market": "cn_hk",    "market_name": "港股", "index_name": "恒生指数"},
    {"market": "kr",       "market_name": "韩国", "index_name": "KOSPI"},
    {"market": "tw",       "market_name": "台湾", "index_name": "加权指数"},
    {"market": "in",       "market_name": "印度", "index_name": "Nifty 50"},
    {"market": "vn",       "market_name": "越南", "index_name": "VN-Index"},
    {"market": "br",       "market_name": "巴西", "index_name": "Bovespa"},
]


# ============================================================
# 工具函数
# ============================================================

def clamp(val, lo, hi):
    return max(lo, min(hi, val))

def log(msg):
    print(msg, file=sys.stderr)

def get_latest_trade_date():
    today = datetime.now()
    if today.hour < 6:
        today -= timedelta(days=1)
    if today.weekday() == 5:
        today -= timedelta(days=1)
    elif today.weekday() == 6:
        today -= timedelta(days=2)
    return today.strftime("%Y-%m-%d")


# ============================================================
# Static Data
# ============================================================

def load_static_data():
    """加载 static_data.json，包含 14 个市场的 25 个指标。"""
    if not STATIC_DATA_FILE.exists():
        log(f"[FATAL] static_data.json 不存在: {STATIC_DATA_FILE}")
        sys.exit(1)
    with open(STATIC_DATA_FILE, encoding="utf-8") as f:
        data = json.load(f)
    # 验证
    required_markets = {m["market"] for m in MARKETS}
    found = set(data.keys())
    missing = required_markets - found
    if missing:
        log(f"[WARN] static_data 缺少市场: {missing}")
    return data


# ============================================================
# 五维评分函数（严格按 OPENCLAW.md 公式）
# ============================================================

def score_info_aggregation(raw):
    """维度一：信息聚合（权重 20%）
    评估市场信息环境的成熟度：分析师覆盖、财报可预测性、做空约束、价格发现效率。
    """
    # sub1: 分析师覆盖深度（0-1）→ 直接线性映射到 0-100
    sub1 = raw.get("analyst_coverage_depth", 0.5) * 100
    # sub2: 财报意外标准差，越低越好
    #   典型范围: 0.02(美/英) - 0.08(越南)，映射: 0.02→80, 0.05→35, 0.08→10
    #   公式: 110 - std*1500，选取使中位数(0.035)约57.5分的斜率
    sub2 = clamp(110 - raw.get("earnings_surprise_std", 0.05) * 1500, 10, 100)
    sub3 = _short_selling_score(raw)
    # sub4: 价格冲击比率（交易1%市值对价格的影响），越低越好
    #   典型范围: 0.35(美) - 0.8(越南)，映射: 0.35→95, 0.5→80, 0.65→65
    sub4 = clamp(130 - raw.get("price_impact_ratio", 0.5) * 100, 10, 100)
    # sub5: 市场效率指数（0-1），综合反映价格反映信息的速度
    sub5 = clamp(raw.get("market_efficiency_index", 0.5) * 100, 0, 100)

    score = round(sub1 * 0.20 + sub2 * 0.20 + sub3 * 0.15 + sub4 * 0.25 + sub5 * 0.20)
    return clamp(score, 0, 100)


def score_transaction_cost(raw):
    """维度二：交易成本（权重 20%）
    评估交易摩擦：佣金、买卖价差、结算效率、税收、流动性。
    """
    # sub1: 综合交易费率（往返佣金+印花税等），越低越好
    #   典型范围: 0.0005(美) - 0.003(越南)，映射: 0.0005→107→100, 0.0015→82, 0.003→45
    #   公式: 120 - rate*25000，选取使中位数(0.001)得77.5分的斜率
    sub1 = clamp(120 - raw.get("total_commission_rate", 0.001) * 25000, 10, 100)
    # sub2: 买卖价差(bps)，越窄越好
    #   典型范围: 3(美) - 35(越南)，映射: 3→113→100, 8→102→100, 35→43
    sub2 = clamp(120 - raw.get("bid_ask_spread_bps", 10) * 2.2, 10, 100)
    # sub3: 结算周期，T+0/T+1=100, T+2=75, T+3=45, T+4+=20
    sd = raw.get("settlement_days", 2)
    sub3 = 100 if sd <= 1 else (75 if sd <= 2 else (45 if sd <= 3 else 20))
    # sub4: 股息预扣税，越低越好（影响跨国投资者的实际回报）
    sub4 = clamp((1 - raw.get("withholding_tax", 0.15)) * 100, 10, 100)
    # sub5: 资本利得税，越低越好
    #   映射: 0%→100, 10%→75, 20%→50, 30%→25, 36%→10
    sub5 = clamp(100 - raw.get("capital_gains_tax", 0.15) * 250, 10, 100)
    # sub6: Amihud非流动性指标（价格冲击的学术度量）
    #   基于对数分布: amihud=1e-11→100(极流动), amihud=5e-8→15(极不流动)
    #   区间选择参考 Amihud (2002) 原文: 美股约1e-11, 新兴市场约1e-8到1e-7
    amihud = raw.get("amihud_illiquidity", 1e-9)
    import math
    log10_am = _log10_safe(amihud)
    log10_min, log10_max = -11, math.log10(5e-8)
    if log10_am <= log10_min:
        sub6 = 100
    elif log10_am >= log10_max:
        sub6 = 15
    else:
        sub6 = clamp(100 - (log10_am - log10_min) / (log10_max - log10_min) * 85, 10, 100)

    score = round(sub1 * 0.15 + sub2 * 0.20 + sub3 * 0.10 + sub4 * 0.15
                  + sub5 * 0.15 + sub6 * 0.25)
    return clamp(score, 0, 100)


def score_incentive_alignment(raw):
    """维度三：激励对齐（权重 20%）"""
    sub1 = raw.get("shareholder_activism_score", 0.5) * 100
    sub2 = raw.get("board_independence_ratio", 0.6) * 100
    sub3 = raw.get("rpt_control_score", 0.6) * 100
    sub4 = _short_selling_score_incent(raw)
    sub5 = raw.get("earnings_quality_score", 0.6) * 100
    sub6 = raw.get("insider_trading_enforcement", 0.5) * 100

    score = round(sub1 * 0.15 + sub2 * 0.15 + sub3 * 0.20 + sub4 * 0.15
                  + sub5 * 0.20 + sub6 * 0.15)
    return clamp(score, 0, 100)


def score_risk_dispersion(raw):
    """维度四：风险分散（权重 20%）"""
    sub1 = raw.get("derivatives_depth", 0.5) * 100
    sub2 = 100 if raw.get("options_available", False) else 20
    sub3 = raw.get("capital_flow_freedom", 0.7) * 100
    sub4 = raw.get("foreign_ownership_limit", 1.0) * 100
    sub5 = raw.get("etf_variety", 0.6) * 100
    # correlation: 作为风险分散维度的一部分，衡量与全球市场的联动程度
    # 低相关性 → 适度加分（有助于投资组合分散化）
    # 高相关性 → 适度扣分（分散化价值较低，但代表信息充分、流动性好）
    # 极低相关性 → 反而扣分（可能是市场封闭、信息隔离）
    # 逻辑：0.3附近最优（有分散价值且信息流通），极端值都有问题
    corr = raw.get("correlation_with_global", 0.5)
    sub6 = clamp(100 - abs(corr - 0.35) * 100, 20, 100)

    score = round(sub1 * 0.20 + sub2 * 0.15 + sub3 * 0.20 + sub4 * 0.15
                  + sub5 * 0.15 + sub6 * 0.15)
    return clamp(score, 0, 100)


def score_property_rights(raw):
    """维度五：产权执行（权重 20%）
    评估法律环境对投资者权益的保护力度。
    """
    # sub1: 法治指数（World Bank WGI），0-1 → 0-100
    sub1 = raw.get("rule_of_law_index", 0.7) * 100
    # sub2: 司法独立性（0-1）
    sub2 = raw.get("judicial_independence", 0.6) * 100
    # sub3: 欺诈执法率（0-1），衡量对财务造假的追究力度
    sub3 = raw.get("fraud_enforcement_rate", 0.5) * 100
    # sub4: 退市率，衡量市场新陈代谢能力
    #   4%-8%为健康区间（美股约5-7%，参考WFE数据）
    #   1%-4%偏低（有僵尸企业），<1%不健康，>8%可能过度
    dr = raw.get("delisting_rate", 0.01)
    if 0.04 <= dr <= 0.08:
        sub4 = 100
    elif dr >= 0.01:
        sub4 = 70
    elif dr > 0:
        sub4 = 40
    else:
        sub4 = 20
    # sub5: 投资者保护指数（World Bank / S&P），1-10 → 10-100
    sub5 = raw.get("investor_protection_index", 5.0) * 10
    # sub6: 会计准则质量（0-1），1.0=IFRS完全采用
    sub6 = raw.get("accounting_standards", 0.5) * 100

    score = round(sub1 * 0.20 + sub2 * 0.15 + sub3 * 0.15 + sub4 * 0.15
                  + sub5 * 0.20 + sub6 * 0.15)
    return clamp(score, 0, 100)


def _log10_safe(val):
    """安全 log10，处理极小值。"""
    if val <= 0:
        return -12  # floor
    import math
    return math.log10(val)


def _short_selling_score(raw):
    """做空制度评分：full=100, restricted=55, prohibited=30。"""
    eff = raw.get("short_selling_effectiveness", "full")
    if raw.get("short_selling_allowed", False) and eff == "full":
        return 100
    elif eff == "restricted":
        return 55
    else:
        return 30


def _short_selling_score_incent(raw):
    """做空制度评分（激励对齐维度用）：full=100, restricted=40, prohibited=25。"""
    eff = raw.get("short_selling_effectiveness", "full")
    if raw.get("short_selling_allowed", False) and eff == "full":
        return 100
    elif eff == "restricted":
        return 40
    else:
        return 25


# ============================================================
# 快变量数据获取（PE/PB 等日间变化的估值指标）
# ============================================================
# 指数 → yfinance ticker 映射
YFINANCE_TICKERS = {
    "us_sp500": "^GSPC",
    "jp": "^N225",
    "gb": "^FTSE",
    "de": "^GDAXI",
    "fr": "^FCHI",
    "au": "^AXJO",
    "ca": "^GSPTSE",
    "cn_ashare": "000300.SS",  # 沪深300
    "cn_hk": "^HSI",
    "kr": "^KS11",
    "tw": "^TWII",
    "in": "^NSEI",
    "vn": "^VNINDEX",
    "br": "^BVSP",
}

MULTPL_PAGES = {
    "us_sp500_pe": "https://www.multpl.com/s-p-500-pe-ratio/table/by-month",
    "us_sp500_cape": "https://www.multpl.com/shiller-pe/table/by-month",
}

FAST_VAR_CACHE = PROJECT_DIR / "data" / "fast_var_cache.json"


def _fetch_multpl_current(url):
    """从 multpl.com 的 meta description 提取当前值。"""
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code != 200:
            return None
        m = re.search(r'is ([\d.]+), a change', r.text)
        return float(m.group(1)) if m else None
    except Exception as e:
        log(f"[WARN] multpl fetch failed: {e}")
        return None


def _fetch_yfinance_pe(ticker):
    """尝试用 yfinance 获取 PE ratio。"""
    try:
        import yfinance as yf
        t = yf.Ticker(ticker)
        # 用 fast_info 避免 rate limit（比 .info 轻量）
        pe = t.fast_info.get("previous_close", None)  # 先测试连接
        # 快速方式不行就用 hist 获取收盘价
        hist = t.history(period="5d")
        if hist.empty:
            return None, None
        price = round(hist["Close"].iloc[-1], 2)
        return None, price  # PE 暂不通过 yfinance 获取
    except Exception as e:
        log(f"[WARN] yfinance {ticker} failed: {e}")
        return None, None


def fetch_fast_variables():
    """获取快变量数据（PE、价格等），优雅降级。"""
    fast = {}

    # 从 multpl.com 获取美股PE/CAPE（已验证：服务器可稳定访问）
    # 其他市场快变量暂不可用（yfinance/东方财富/Google均被服务器IP限制）
    # TODO: 当有住宅代理或CDN中转时可扩展

    sp500_pe = _fetch_multpl_current(MULTPL_PAGES["us_sp500_pe"])
    if sp500_pe:
        fast["us_sp500"] = {"pe_ttm": sp500_pe, "pe_source": "multpl.com"}
        log(f"  [fast] 美股 S&P 500 PE: {sp500_pe} (multpl.com)")

    cape = _fetch_multpl_current(MULTPL_PAGES["us_sp500_cape"])
    if cape:
        fast.setdefault("us_sp500", {})["cape"] = cape
        fast["us_sp500"]["cape_source"] = "multpl.com"
        log(f"  [fast] 美股 Shiller CAPE: {cape} (multpl.com)")

    return fast


def load_fast_var_cache():
    """加载上次快变量缓存，用于变化追踪。"""
    if FAST_VAR_CACHE.exists():
        with open(FAST_VAR_CACHE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_fast_var_cache(data):
    """保存快变量缓存。"""
    FAST_VAR_CACHE.parent.mkdir(parents=True, exist_ok=True)
    with open(FAST_VAR_CACHE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ============================================================
# 主函数
# ============================================================

def main():
    log("=== ValueScope v3 — 五维评分体系 ===")

    # 1. 判断最近交易日
    trade_date = get_latest_trade_date()
    log(f"最近交易日: {trade_date}")

    # 2. 加载 static_data
    static = load_static_data()
    log(f"已加载 static_data ({len(static)} 个市场)")

    # 3. 获取快变量数据
    log("获取快变量数据...")
    fast_vars = fetch_fast_variables()
    if fast_vars:
        save_fast_var_cache({"date": trade_date, "data": fast_vars})
        log(f"快变量: 获取到 {len(fast_vars)} 个市场")
    else:
        log("[WARN] 快变量全部获取失败，仅输出慢变量评分")

    # 4. 加载上日数据用于变化追踪
    prev_date = (datetime.strptime(trade_date, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
    prev_file = DATA_DIR / f"{prev_date}.json"
    prev_scores = {}
    if prev_file.exists():
        with open(prev_file, encoding="utf-8") as f:
            prev = json.load(f)
        for m in prev.get("markets", []):
            prev_scores[m["market"]] = {
                "fish_score": m["fish_score"],
                "date": prev_date,
            }

    # 5. 对每个市场计算评分
    entries = []
    for m in MARKETS:
        mid = m["market"]
        raw = static.get(mid)
        if raw is None:
            log(f"[WARN] 跳过 {mid}（无 static_data）")
            continue

        # 计算五维评分
        dim_info = score_info_aggregation(raw)
        dim_cost = score_transaction_cost(raw)
        dim_incent = score_incentive_alignment(raw)
        dim_risk = score_risk_dispersion(raw)
        dim_prop = score_property_rights(raw)

        fish = round(
            dim_info * 0.20
            + dim_cost * 0.20
            + dim_incent * 0.20
            + dim_risk * 0.20
            + dim_prop * 0.20
        )

        dimensions = {
            "info_aggregation":    {"score": dim_info,  "weight": 0.20},
            "transaction_cost":    {"score": dim_cost,  "weight": 0.20},
            "incentive_alignment": {"score": dim_incent, "weight": 0.20},
            "risk_dispersion":     {"score": dim_risk,  "weight": 0.20},
            "property_rights":     {"score": dim_prop,  "weight": 0.20},
        }

        # 构建entry
        entry = {
            "market": mid,
            "market_name": m["market_name"],
            "index_name": m["index_name"],
            "fish_score": fish,
            "dimensions": dimensions,
            "raw_indicators": raw,
        }

        # 添加快变量数据
        if mid in fast_vars:
            entry["fast_variables"] = fast_vars[mid]

        # 变化追踪
        if mid in prev_scores:
            change = fish - prev_scores[mid]["fish_score"]
            entry["change"] = {
                "fish_score": change,
                "prev_date": prev_scores[mid]["date"],
                "prev_score": prev_scores[mid]["fish_score"],
            }

        entries.append(entry)

        change_str = ""
        if mid in prev_scores:
            ch = fish - prev_scores[mid]["fish_score"]
            arrow = "↑" if ch > 0 else ("↓" if ch < 0 else "=")
            change_str = f" {arrow}{abs(ch)}"
        log(f"  {m['market_name']:4s} | fish={fish:3d}{change_str} | "
            f"info={dim_info:3d} cost={dim_cost:3d} "
            f"incent={dim_incent:3d} risk={dim_risk:3d} prop={dim_prop:3d}")

    if not entries:
        log("[FATAL] 没有成功生成任何市场数据")
        sys.exit(1)

    # 6. 输出 JSON
    report = {
        "date": trade_date,
        "generated_at": datetime.now().strftime("%Y-%m-%dT%H:%M:%S%z"),
        "fast_var_count": len(fast_vars),
        "markets": entries,
    }

    output_file = DATA_DIR / f"{trade_date}.json"
    output_file.parent.mkdir(parents=True, exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    log(f"输出文件: {output_file} ({len(entries)} 个市场)")

    # 7. git commit & push
    try:
        sp.run(["git", "add", str(output_file)], cwd=str(PROJECT_DIR),
               check=True, capture_output=True)
        result = sp.run(
            ["git", "commit", "-m",
             f"📊 {trade_date}: update market data v3 ({len(entries)} markets)"],
            cwd=str(PROJECT_DIR), capture_output=True, text=True)
        if result.returncode == 0:
            log(f"Git commit: {result.stdout.strip()}")
            push_result = sp.run(
                ["git", "push"], cwd=str(PROJECT_DIR),
                capture_output=True, text=True, timeout=30)
            if push_result.returncode == 0:
                log("Git push 成功")
            else:
                log(f"Git push 失败: {push_result.stderr.strip()}")
        else:
            log("Git commit: 无变更或失败")
    except Exception as e:
        log(f"[WARN] git 操作: {e}")

    log("=== 采集完成 ===")


if __name__ == "__main__":
    main()
