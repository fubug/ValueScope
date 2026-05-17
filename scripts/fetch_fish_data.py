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
    """维度一：信息聚合（权重 20%）"""
    sub1 = raw.get("analyst_coverage_depth", 0.5) * 100
    sub2 = clamp(100 - raw.get("earnings_surprise_std", 0.05) * 1600, 10, 100)
    sub3 = 100 if raw.get("short_selling_allowed", False) else 30
    sub4 = clamp(130 - raw.get("price_impact_ratio", 0.5) * 100, 10, 100)
    sub5 = clamp(raw.get("market_efficiency_index", 0.5) * 100, 0, 100)

    score = round(sub1 * 0.20 + sub2 * 0.20 + sub3 * 0.15 + sub4 * 0.25 + sub5 * 0.20)
    return clamp(score, 0, 100)


def score_transaction_cost(raw):
    """维度二：交易成本（权重 20%）"""
    sub1 = clamp(120 - raw.get("total_commission_rate", 0.001) * 25000, 10, 100)
    sub2 = clamp(120 - raw.get("bid_ask_spread_bps", 10) * 2.2, 10, 100)
    sd = raw.get("settlement_days", 2)
    sub3 = 100 if sd <= 1 else (75 if sd <= 2 else (45 if sd <= 3 else 20))
    sub4 = clamp((1 - raw.get("withholding_tax", 0.15)) * 100, 10, 100)
    sub5 = clamp(100 - raw.get("capital_gains_tax", 0.15) * 250, 10, 100)
    amihud = raw.get("amihud_illiquidity", 1e-9)
    sub6 = clamp(100 - _log10_safe(amihud + 1e-12) * 20 - 60, 10, 100)

    score = round(sub1 * 0.15 + sub2 * 0.20 + sub3 * 0.10 + sub4 * 0.15
                  + sub5 * 0.15 + sub6 * 0.25)
    return clamp(score, 0, 100)


def score_incentive_alignment(raw):
    """维度三：激励对齐（权重 20%）"""
    sub1 = raw.get("shareholder_activism_score", 0.5) * 100
    sub2 = raw.get("board_independence_ratio", 0.6) * 100
    sub3 = raw.get("rpt_control_score", 0.6) * 100
    sub4 = 100 if raw.get("short_selling_allowed", False) else 25
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
    corr = raw.get("correlation_with_global", 0.5)
    if 0.4 <= corr <= 0.75:
        sub6 = 90
    elif corr < 0.4:
        sub6 = 50
    else:
        sub6 = clamp(130 - corr * 70, 40, 90)

    score = round(sub1 * 0.20 + sub2 * 0.15 + sub3 * 0.20 + sub4 * 0.15
                  + sub5 * 0.15 + sub6 * 0.15)
    return clamp(score, 0, 100)


def score_property_rights(raw):
    """维度五：产权执行（权重 20%）"""
    sub1 = raw.get("rule_of_law_index", 0.7) * 100
    sub2 = raw.get("judicial_independence", 0.6) * 100
    sub3 = raw.get("fraud_enforcement_rate", 0.5) * 100
    dr = raw.get("delisting_rate", 0.01)
    if 0.04 <= dr <= 0.08:
        sub4 = 100
    elif dr >= 0.01:
        sub4 = 70
    elif dr > 0:
        sub4 = 40
    else:
        sub4 = 20
    sub5 = raw.get("investor_protection_index", 5.0) * 10
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


# ============================================================
# 主函数
# ============================================================

def main():
    log("=== ValueScope v3 — 五维评分体系 ===")

    # 1. 判断最近交易日
    trade_date = get_latest_trade_date()
    log(f"最近交易日: {trade_date}")

    # 2. 检查是否已有当日数据
    output_file = DATA_DIR / f"{trade_date}.json"
    if output_file.exists():
        log(f"当日数据已存在: {output_file}")
        try:
            existing = json.loads(output_file.read_text())
            if len(existing.get("markets", [])) >= 14:
                log("已有 14 个市场数据，跳过采集")
                return
        except Exception:
            pass

    # 3. 加载 static_data
    static = load_static_data()
    log(f"已加载 static_data ({len(static)} 个市场)")

    # 4. 对每个市场计算评分
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

        entry = {
            "market": mid,
            "market_name": m["market_name"],
            "index_name": m["index_name"],
            "fish_score": fish,
            "dimensions": dimensions,
            "raw_indicators": raw,
        }
        entries.append(entry)

        log(f"  {m['market_name']:4s} | fish={fish:3d} | "
            f"info={dim_info:3d} cost={dim_cost:3d} "
            f"incent={dim_incent:3d} risk={dim_risk:3d} prop={dim_prop:3d}")

    if not entries:
        log("[FATAL] 没有成功生成任何市场数据")
        sys.exit(1)

    # 5. 输出 JSON
    report = {
        "date": trade_date,
        "markets": entries,
    }

    output_file.parent.mkdir(parents=True, exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    log(f"输出文件: {output_file} ({len(entries)} 个市场)")

    # 6. git commit & push
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
