#!/usr/bin/env python3
"""
ValueScope 每日数据采集脚本 v2
从互联网抓取14个市场真实数据，按 OPENCLAW.md 规格计算六维评分

数据源:
  - 实时价格: CNBC web scraping, 腾讯财经 API
  - A股估值: AKShare (PE/PB)
  - 美股CAPE/10Y: multpl.com
  - 历史指标: 52周范围推算 + 缓存历史数据 + 参考值填充
  - 搜索整理类: static_data.json (来自OPENCLAW.md参考值)
"""

import json, os, re, sys, time, math, subprocess as sp
from datetime import datetime, timedelta
from pathlib import Path
import requests
import numpy as np
import pandas as pd

# ============================================================
# 配置
# ============================================================

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / "data" / "daily"
CACHE_DIR = PROJECT_DIR / "scripts" / "cache"
STATIC_DATA_FILE = SCRIPT_DIR / "static_data.json"
HISTORY_DIR = CACHE_DIR / "history"

DATA_DIR.mkdir(parents=True, exist_ok=True)
HISTORY_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}

DIM_KEYS = ["profit_effect","valuation","scale_liquidity","fundamentals","institutional","risk_penalty"]
DIM_WEIGHTS = {"profit_effect":0.25,"valuation":0.20,"scale_liquidity":0.10,
               "fundamentals":0.15,"institutional":0.15,"risk_penalty":0.15}

MARKETS = [
    {"market":"us_sp500","market_name":"美国","index_name":"S&P 500","cnbc":".SPX","yf":"^GSPC","tencent":None,"currency":"USD"},
    {"market":"jp","market_name":"日本","index_name":"日经225","cnbc":".N225","yf":"^N225","tencent":None,"currency":"JPY"},
    {"market":"gb","market_name":"英国","index_name":"FTSE 100","cnbc":".FTSE","yf":"^FTSE","tencent":None,"currency":"GBP"},
    {"market":"de","market_name":"德国","index_name":"DAX","cnbc":".GDAXI","yf":"^GDAXI","tencent":None,"currency":"EUR"},
    {"market":"fr","market_name":"法国","index_name":"CAC 40","cnbc":".FCHI","yf":"^FCHI","tencent":None,"currency":"EUR"},
    {"market":"au","market_name":"澳洲","index_name":"ASX 200","cnbc":".AXJO","yf":"^AXJO","tencent":None,"currency":"AUD"},
    {"market":"ca","market_name":"加拿大","index_name":"S&P/TSX","cnbc":".GSPTSE","yf":"^GSPTSE","tencent":None,"currency":"CAD"},
    {"market":"cn_ashare","market_name":"A股","index_name":"沪深300","cnbc":None,"yf":None,"tencent":"sh000300","currency":"CNY"},
    {"market":"cn_hk","market_name":"港股","index_name":"恒生指数","cnbc":".HSI","yf":"^HSI","tencent":"hkHSI","currency":"HKD"},
    {"market":"kr","market_name":"韩国","index_name":"KOSPI","cnbc":".KS11","yf":"^KS11","tencent":None,"currency":"KRW"},
    {"market":"tw","market_name":"台湾","index_name":"加权指数","cnbc":".TWII","yf":"^TWII","tencent":None,"currency":"TWD"},
    {"market":"in","market_name":"印度","index_name":"Nifty 50","cnbc":".NSEI","yf":"^NSEI","tencent":None,"currency":"INR"},
    {"market":"vn","market_name":"越南","index_name":"VN-Index","cnbc":None,"yf":"^VNINDEX","tencent":None,"currency":"VND"},
    {"market":"br","market_name":"巴西","index_name":"Bovespa","cnbc":".BVSP","yf":"^BVSP","tencent":None,"currency":"BRL"},
]

RISK_FREE_RATE = 0.045


# ============================================================
# 工具函数
# ============================================================

def clamp(val, lo, hi):
    return max(lo, min(hi, val))

def log(msg):
    print(msg, file=sys.stderr)

def get_latest_trade_date():
    today = datetime.now()
    if today.hour < 6: today -= timedelta(days=1)
    if today.weekday() == 5: today -= timedelta(days=1)
    elif today.weekday() == 6: today -= timedelta(days=2)
    return today.strftime("%Y-%m-%d")

# ============================================================
# Static Data (搜索整理类指标, from OPENCLAW.md)
# ============================================================

DEFAULT_STATIC = {
    "us_sp500": dict(cape_shiller_pe=38.0, ev_ebitda=20.5, dividend_buyback_yield=0.042,
        free_float_market_cap_usd=48e12, bid_ask_spread_bps=2.0,
        manufacturing_pmi=50.5, services_pmi=51.8, earnings_growth_yoy=0.12,
        credit_spread=0.009, unemployment_rate=0.042,
        foreign_ownership_limit=1.0, capital_flow_freedom=1.0, etf_available=True,
        settlement_days=1, withholding_tax=0.10, investor_protection_index=8.3,
        accounting_standards=1.0, market_transparency=0.95, dual_listing_accessibility=True,
        sovereign_cds_spread=20, geopolitical_risk_index=15, capital_control_risk=0.0),
    "jp": dict(cape_shiller_pe=22.0, ev_ebitda=14.0, dividend_buyback_yield=0.028,
        free_float_market_cap_usd=6.2e12, bid_ask_spread_bps=5.0,
        manufacturing_pmi=55.1, services_pmi=51.0, earnings_growth_yoy=0.12,
        credit_spread=0.007, unemployment_rate=0.027,
        foreign_ownership_limit=1.0, capital_flow_freedom=0.95, etf_available=True,
        settlement_days=2, withholding_tax=0.15, investor_protection_index=7.1,
        accounting_standards=1.0, market_transparency=0.85, dual_listing_accessibility=True,
        sovereign_cds_spread=25, geopolitical_risk_index=20, capital_control_risk=0.0),
    "gb": dict(cape_shiller_pe=18.5, ev_ebitda=12.0, dividend_buyback_yield=0.045,
        free_float_market_cap_usd=4.0e12, bid_ask_spread_bps=4.0,
        manufacturing_pmi=53.7, services_pmi=52.7, earnings_growth_yoy=0.065,
        credit_spread=0.011, unemployment_rate=0.049,
        foreign_ownership_limit=1.0, capital_flow_freedom=0.95, etf_available=True,
        settlement_days=2, withholding_tax=0.0, investor_protection_index=8.0,
        accounting_standards=1.0, market_transparency=0.90, dual_listing_accessibility=True,
        sovereign_cds_spread=22, geopolitical_risk_index=15, capital_control_risk=0.0),
    "de": dict(cape_shiller_pe=20.0, ev_ebitda=13.5, dividend_buyback_yield=0.035,
        free_float_market_cap_usd=2.8e12, bid_ask_spread_bps=4.0,
        manufacturing_pmi=51.4, services_pmi=46.9, earnings_growth_yoy=0.085,
        credit_spread=0.009, unemployment_rate=0.064,
        foreign_ownership_limit=1.0, capital_flow_freedom=0.95, etf_available=True,
        settlement_days=2, withholding_tax=0.15, investor_protection_index=8.2,
        accounting_standards=1.0, market_transparency=0.90, dual_listing_accessibility=True,
        sovereign_cds_spread=25, geopolitical_risk_index=20, capital_control_risk=0.0),
    "fr": dict(cape_shiller_pe=17.0, ev_ebitda=12.5, dividend_buyback_yield=0.040,
        free_float_market_cap_usd=3.0e12, bid_ask_spread_bps=4.5,
        manufacturing_pmi=52.8, services_pmi=46.5, earnings_growth_yoy=0.07,
        credit_spread=0.011, unemployment_rate=0.081,
        foreign_ownership_limit=1.0, capital_flow_freedom=0.95, etf_available=True,
        settlement_days=2, withholding_tax=0.15, investor_protection_index=7.8,
        accounting_standards=1.0, market_transparency=0.85, dual_listing_accessibility=True,
        sovereign_cds_spread=28, geopolitical_risk_index=18, capital_control_risk=0.0),
    "au": dict(cape_shiller_pe=19.0, ev_ebitda=13.0, dividend_buyback_yield=0.048,
        free_float_market_cap_usd=1.8e12, bid_ask_spread_bps=4.0,
        manufacturing_pmi=51.3, services_pmi=50.7, earnings_growth_yoy=0.08,
        credit_spread=0.009, unemployment_rate=0.043,
        foreign_ownership_limit=1.0, capital_flow_freedom=0.90, etf_available=True,
        settlement_days=2, withholding_tax=0.15, investor_protection_index=8.2,
        accounting_standards=1.0, market_transparency=0.90, dual_listing_accessibility=True,
        sovereign_cds_spread=25, geopolitical_risk_index=10, capital_control_risk=0.0),
    "ca": dict(cape_shiller_pe=20.5, ev_ebitda=13.0, dividend_buyback_yield=0.038,
        free_float_market_cap_usd=3.2e12, bid_ask_spread_bps=3.5,
        manufacturing_pmi=53.3, services_pmi=49.2, earnings_growth_yoy=0.09,
        credit_spread=0.009, unemployment_rate=0.069,
        foreign_ownership_limit=1.0, capital_flow_freedom=0.95, etf_available=True,
        settlement_days=2, withholding_tax=0.15, investor_protection_index=8.3,
        accounting_standards=1.0, market_transparency=0.90, dual_listing_accessibility=True,
        sovereign_cds_spread=22, geopolitical_risk_index=10, capital_control_risk=0.0),
    "cn_ashare": dict(cape_shiller_pe=15.5, ev_ebitda=11.0, dividend_buyback_yield=0.030,
        free_float_market_cap_usd=5.6e12, bid_ask_spread_bps=8.0,
        manufacturing_pmi=50.2, services_pmi=51.0, earnings_growth_yoy=0.08,
        credit_spread=0.015, unemployment_rate=0.052,
        foreign_ownership_limit=0.30, capital_flow_freedom=0.50, etf_available=True,
        settlement_days=1, withholding_tax=0.10, investor_protection_index=4.6,
        accounting_standards=0.5, market_transparency=0.45, dual_listing_accessibility=True,
        sovereign_cds_spread=60, geopolitical_risk_index=45, capital_control_risk=0.35),
    "cn_hk": dict(cape_shiller_pe=12.5, ev_ebitda=9.5, dividend_buyback_yield=0.045,
        free_float_market_cap_usd=4.5e12, bid_ask_spread_bps=6.0,
        manufacturing_pmi=49.5, services_pmi=51.5, earnings_growth_yoy=0.05,
        credit_spread=0.012, unemployment_rate=0.030,
        foreign_ownership_limit=1.0, capital_flow_freedom=0.90, etf_available=True,
        settlement_days=2, withholding_tax=0.0, investor_protection_index=7.3,
        accounting_standards=1.0, market_transparency=0.80, dual_listing_accessibility=True,
        sovereign_cds_spread=40, geopolitical_risk_index=55, capital_control_risk=0.10),
    "kr": dict(cape_shiller_pe=14.5, ev_ebitda=11.0, dividend_buyback_yield=0.025,
        free_float_market_cap_usd=1.8e12, bid_ask_spread_bps=7.0,
        manufacturing_pmi=53.6, services_pmi=52.0, earnings_growth_yoy=0.15,
        credit_spread=0.012, unemployment_rate=0.028,
        foreign_ownership_limit=1.0, capital_flow_freedom=0.70, etf_available=True,
        settlement_days=2, withholding_tax=0.15, investor_protection_index=6.2,
        accounting_standards=1.0, market_transparency=0.70, dual_listing_accessibility=True,
        sovereign_cds_spread=35, geopolitical_risk_index=55, capital_control_risk=0.05),
    "tw": dict(cape_shiller_pe=22.0, ev_ebitda=15.0, dividend_buyback_yield=0.035,
        free_float_market_cap_usd=2.2e12, bid_ask_spread_bps=6.0,
        manufacturing_pmi=55.3, services_pmi=54.0, earnings_growth_yoy=0.18,
        credit_spread=0.010, unemployment_rate=0.034,
        foreign_ownership_limit=1.0, capital_flow_freedom=0.70, etf_available=True,
        settlement_days=2, withholding_tax=0.20, investor_protection_index=7.0,
        accounting_standards=1.0, market_transparency=0.75, dual_listing_accessibility=True,
        sovereign_cds_spread=30, geopolitical_risk_index=60, capital_control_risk=0.05),
    "in": dict(cape_shiller_pe=24.0, ev_ebitda=18.0, dividend_buyback_yield=0.015,
        free_float_market_cap_usd=4.5e12, bid_ask_spread_bps=8.0,
        manufacturing_pmi=54.7, services_pmi=58.8, earnings_growth_yoy=0.15,
        credit_spread=0.015, unemployment_rate=0.052,
        foreign_ownership_limit=0.30, capital_flow_freedom=0.55, etf_available=True,
        settlement_days=2, withholding_tax=0.15, investor_protection_index=4.5,
        accounting_standards=0.5, market_transparency=0.55, dual_listing_accessibility=True,
        sovereign_cds_spread=55, geopolitical_risk_index=35, capital_control_risk=0.20),
    "vn": dict(cape_shiller_pe=16.0, ev_ebitda=12.0, dividend_buyback_yield=0.030,
        free_float_market_cap_usd=280e9, bid_ask_spread_bps=15.0,
        manufacturing_pmi=50.5, services_pmi=None, earnings_growth_yoy=0.12,
        credit_spread=0.025, unemployment_rate=0.022,
        foreign_ownership_limit=0.49, capital_flow_freedom=0.35, etf_available=False,
        settlement_days=3, withholding_tax=0.05, investor_protection_index=3.5,
        accounting_standards=0.3, market_transparency=0.30, dual_listing_accessibility=False,
        sovereign_cds_spread=120, geopolitical_risk_index=30, capital_control_risk=0.30),
    "br": dict(cape_shiller_pe=11.0, ev_ebitda=8.5, dividend_buyback_yield=0.060,
        free_float_market_cap_usd=1.2e12, bid_ask_spread_bps=10.0,
        manufacturing_pmi=52.6, services_pmi=52.3, earnings_growth_yoy=0.10,
        credit_spread=0.020, unemployment_rate=0.061,
        foreign_ownership_limit=1.0, capital_flow_freedom=0.65, etf_available=True,
        settlement_days=2, withholding_tax=0.0, investor_protection_index=5.2,
        accounting_standards=0.5, market_transparency=0.50, dual_listing_accessibility=True,
        sovereign_cds_spread=100, geopolitical_risk_index=25, capital_control_risk=0.10),
}

DEFAULT_PE = {"us_sp500":25.0,"jp":18.24,"gb":17.64,"de":17.64,"fr":17.81,
    "au":20.49,"ca":19.42,"cn_ashare":13.82,"cn_hk":11.0,"kr":19.84,
    "tw":23.80,"in":22.92,"vn":16.52,"br":11.82}

DEFAULT_BOND = {"us_sp500":0.045,"jp":0.010,"gb":0.042,"de":0.025,"fr":0.030,
    "au":0.043,"ca":0.032,"cn_ashare":0.017,"cn_hk":0.040,"kr":0.026,
    "tw":0.022,"in":0.070,"vn":0.030,"br":0.145}
DEFAULT_GDP = {"us_sp500":0.025,"jp":0.011,"gb":0.006,"de":0.004,"fr":0.008,
    "au":0.017,"ca":0.015,"cn_ashare":0.048,"cn_hk":0.030,"kr":0.022,
    "tw":0.032,"in":0.068,"vn":0.065,"br":0.025}
DEFAULT_CPI = {"us_sp500":0.023,"jp":0.003,"gb":0.026,"de":0.022,"fr":0.020,
    "au":0.024,"ca":0.025,"cn_ashare":0.001,"cn_hk":0.015,"kr":0.016,
    "tw":0.025,"in":0.045,"vn":0.030,"br":0.040}
DEFAULT_POLICY = {"us_sp500":0.045,"jp":0.005,"gb":0.042,"de":0.025,"fr":0.025,
    "au":0.036,"ca":0.030,"cn_ashare":0.031,"cn_hk":0.045,"kr":0.025,
    "tw":0.020,"in":0.065,"vn":0.030,"br":0.145}

# 每个市场的历史参考值（来自 OPENCLAW.md 风险惩罚表格和实际数据）
# 这些值用于 yfinance 被限流时的回退
HISTORICAL_DEFAULTS = {
    "us_sp500": {"cagr_5y": 0.105, "sharpe_3y": 0.65, "positive_year_ratio_10y": 0.80,
                 "max_drawdown_10y": -0.34, "pe_percentile": 0.78, "pb_percentile": 0.80,
                 "drawdown_recovery_months": 6, "correlation_with_us": 1.0,
                 "amihud_illiquidity": 1e-11, "volatility_20d": 0.15},
    "jp": {"cagr_5y": 0.085, "sharpe_3y": 0.55, "positive_year_ratio_10y": 0.70,
            "max_drawdown_10y": -0.28, "pe_percentile": 0.55, "pb_percentile": 0.60,
            "drawdown_recovery_months": 8, "correlation_with_us": 0.55,
            "amihud_illiquidity": 5e-11, "volatility_20d": 0.18},
    "gb": {"cagr_5y": 0.035, "sharpe_3y": 0.30, "positive_year_ratio_10y": 0.70,
            "max_drawdown_10y": -0.30, "pe_percentile": 0.50, "pb_percentile": 0.55,
            "drawdown_recovery_months": 10, "correlation_with_us": 0.70,
            "amihud_illiquidity": 3e-11, "volatility_20d": 0.13},
    "de": {"cagr_5y": 0.060, "sharpe_3y": 0.35, "positive_year_ratio_10y": 0.70,
            "max_drawdown_10y": -0.32, "pe_percentile": 0.60, "pb_percentile": 0.65,
            "drawdown_recovery_months": 12, "correlation_with_us": 0.72,
            "amihud_illiquidity": 4e-11, "volatility_20d": 0.16},
    "fr": {"cagr_5y": 0.045, "sharpe_3y": 0.30, "positive_year_ratio_10y": 0.65,
            "max_drawdown_10y": -0.30, "pe_percentile": 0.45, "pb_percentile": 0.50,
            "drawdown_recovery_months": 12, "correlation_with_us": 0.70,
            "amihud_illiquidity": 4e-11, "volatility_20d": 0.15},
    "au": {"cagr_5y": 0.055, "sharpe_3y": 0.40, "positive_year_ratio_10y": 0.70,
            "max_drawdown_10y": -0.28, "pe_percentile": 0.55, "pb_percentile": 0.60,
            "drawdown_recovery_months": 8, "correlation_with_us": 0.60,
            "amihud_illiquidity": 3e-11, "volatility_20d": 0.13},
    "ca": {"cagr_5y": 0.055, "sharpe_3y": 0.45, "positive_year_ratio_10y": 0.75,
            "max_drawdown_10y": -0.30, "pe_percentile": 0.50, "pb_percentile": 0.55,
            "drawdown_recovery_months": 8, "correlation_with_us": 0.75,
            "amihud_illiquidity": 3e-11, "volatility_20d": 0.14},
    "cn_ashare": {"cagr_5y": 0.020, "sharpe_3y": 0.10, "positive_year_ratio_10y": 0.50,
                  "max_drawdown_10y": -0.45, "pe_percentile": 0.15, "pb_percentile": 0.10,
                  "drawdown_recovery_months": 18, "correlation_with_us": 0.25,
                  "amihud_illiquidity": 2e-10, "volatility_20d": 0.20},
    "cn_hk": {"cagr_5y": 0.010, "sharpe_3y": 0.05, "positive_year_ratio_10y": 0.50,
              "max_drawdown_10y": -0.50, "pe_percentile": 0.25, "pb_percentile": 0.20,
              "drawdown_recovery_months": 20, "correlation_with_us": 0.55,
              "amihud_illiquidity": 5e-10, "volatility_20d": 0.22},
    "kr": {"cagr_5y": 0.065, "sharpe_3y": 0.40, "positive_year_ratio_10y": 0.65,
            "max_drawdown_10y": -0.30, "pe_percentile": 0.30, "pb_percentile": 0.35,
            "drawdown_recovery_months": 10, "correlation_with_us": 0.50,
            "amihud_illiquidity": 1e-10, "volatility_20d": 0.18},
    "tw": {"cagr_5y": 0.110, "sharpe_3y": 0.60, "positive_year_ratio_10y": 0.80,
            "max_drawdown_10y": -0.35, "pe_percentile": 0.65, "pb_percentile": 0.70,
            "drawdown_recovery_months": 6, "correlation_with_us": 0.60,
            "amihud_illiquidity": 5e-11, "volatility_20d": 0.17},
    "in": {"cagr_5y": 0.090, "sharpe_3y": 0.55, "positive_year_ratio_10y": 0.75,
            "max_drawdown_10y": -0.40, "pe_percentile": 0.80, "pb_percentile": 0.85,
            "drawdown_recovery_months": 8, "correlation_with_us": 0.35,
            "amihud_illiquidity": 5e-11, "volatility_20d": 0.14},
    "vn": {"cagr_5y": 0.065, "sharpe_3y": 0.35, "positive_year_ratio_10y": 0.70,
            "max_drawdown_10y": -0.45, "pe_percentile": 0.45, "pb_percentile": 0.50,
            "drawdown_recovery_months": 15, "correlation_with_us": 0.25,
            "amihud_illiquidity": 2e-9, "volatility_20d": 0.17},
    "br": {"cagr_5y": 0.025, "sharpe_3y": 0.15, "positive_year_ratio_10y": 0.55,
            "max_drawdown_10y": -0.50, "pe_percentile": 0.25, "pb_percentile": 0.20,
            "drawdown_recovery_months": 20, "correlation_with_us": 0.50,
            "amihud_illiquidity": 5e-10, "volatility_20d": 0.22},
}

# ============================================================
# Static Data Management
# ============================================================

def load_static_data():
    if STATIC_DATA_FILE.exists():
        try:
            with open(STATIC_DATA_FILE) as f:
                data = json.load(f)
            for mid in DEFAULT_STATIC:
                if mid not in data:
                    data[mid] = dict(DEFAULT_STATIC[mid])
            return data
        except Exception as e:
            log(f"[WARN] static_data: {e}")
    save_static_data(DEFAULT_STATIC)
    return {k: dict(v) for k, v in DEFAULT_STATIC.items()}

def save_static_data(data):
    with open(STATIC_DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# ============================================================
# Data Fetching
# ============================================================

def fetch_cnbc_price(ticker):
    try:
        resp = requests.get(f"https://www.cnbc.com/quotes/{ticker}", headers=HEADERS, timeout=15)
        if resp.status_code != 200: return None
        text = resp.text
        m = re.search(r'"price":"([\d,.]+)"', text)
        price = float(m.group(1).replace(",", "")) if m else None
        low_m = re.search(r'52.WEEK\s*LOW[\s\S]*?(\d[\d,]+\.\d+)', text, re.I)
        high_m = re.search(r'52.WEEK\s*HIGH[\s\S]*?(\d[\d,]+\.\d+)', text, re.I)
        low_52w = float(low_m.group(1).replace(",", "")) if low_m else None
        high_52w = float(high_m.group(1).replace(",", "")) if high_m else None
        return {"price": price, "low_52w": low_52w, "high_52w": high_52w}
    except Exception as e:
        log(f"[WARN] CNBC {ticker}: {e}")
        return None

def fetch_tencent_prices(symbols):
    results = {}
    try:
        valid = [s for s in symbols if s]
        if not valid: return results
        resp = requests.get(f"https://qt.gtimg.cn?q={','.join(valid)}", timeout=10)
        for line in resp.content.decode("gbk", errors="replace").strip().split("\n"):
            if not line.startswith("v_"): continue
            p = line.split("~")
            if len(p) < 45: continue
            sym = line.split("=")[0].replace("v_", "")
            close = float(p[3] or 0)
            prev_close = float(p[4] or 0)
            volume = float(p[6] or 0)
            high_52w = float(p[41] or 0)
            low_52w = float(p[42] or 0)
            pe_ttm = float(p[39] or 0) if len(p) > 39 and p[39] else 0
            results[sym] = {"close": close, "prev_close": prev_close,
                "change_pct": round((close - prev_close) / prev_close * 100, 2) if prev_close > 0 else 0,
                "volume": volume, "high_52w": high_52w, "low_52w": low_52w, "pe_ttm": pe_ttm}
    except Exception as e:
        log(f"[WARN] tencent: {e}")
    return results

def fetch_a_share_valuation():
    result = {}
    try:
        import akshare as ak
        import warnings; warnings.filterwarnings("ignore")
        df_pe = ak.stock_index_pe_lg(symbol="沪深300")
        if df_pe is not None and len(df_pe) > 0:
            result["pe_ttm"] = float(df_pe.iloc[-1]["滚动市盈率"])
            df_pe["日期"] = pd.to_datetime(df_pe["日期"], errors="coerce")
            cutoff = pd.Timestamp.now() - timedelta(days=3650)
            hist = df_pe.loc[df_pe["日期"] >= cutoff, "滚动市盈率"].dropna()
            if len(hist) > 0:
                result["pe_percentile"] = float((df_pe.iloc[-1]["滚动市盈率"] < hist).mean())
        df_pb = ak.stock_index_pb_lg(symbol="沪深300")
        if df_pb is not None and len(df_pb) > 0:
            result["pb_ttm"] = float(df_pb.iloc[-1]["市净率"])
            df_pb["日期"] = pd.to_datetime(df_pb["日期"], errors="coerce")
            cutoff = pd.Timestamp.now() - timedelta(days=3650)
            hist = df_pb.loc[df_pb["日期"] >= cutoff, "市净率"].dropna()
            if len(hist) > 0:
                result["pb_percentile"] = float((df_pb.iloc[-1]["市净率"] < hist).mean())
    except Exception as e:
        log(f"[WARN] A股估值: {e}")
    return result

def fetch_multpl_val(path):
    """从 multpl.com 抓取数据。优先用 s-p-500-xxx 系列 URL（有纯文本数据），回退到通用匹配"""
    try:
        url = f"https://www.multpl.com/{path}"
        resp = requests.get(url, headers=HEADERS, timeout=10)
        if resp.status_code != 200: return None
        # 优先匹配 meta description 中的 "Current XXX is NN.NN"
        m = re.search(r'Current\s+[^>]*?\s+is\s+([\d.]+)', resp.text)
        if m: return float(m.group(1))
        # 回退：通用 "is X.XX" 模式
        m = re.search(r'is\s+([\d.]+)', resp.text)
        return float(m.group(1)) if m else None
    except: return None

def fetch_vnindex():
    """获取越南 VN-Index 价格"""
    try:
        # Try Google Finance
        resp = requests.get("https://www.google.com/finance/quote/VNINDEX:HM",
                            headers=HEADERS, timeout=10)
        nums = re.findall(r'([\d,]+\.\d+)', resp.text[:5000])
        if nums:
            for n in nums:
                v = float(n.replace(",", ""))
                if 1000 < v < 5000:  # VN-Index range
                    return v
    except: pass
    return None

# ============================================================
# History Cache (yfinance fallback)
# ============================================================

def load_history_cache(market_id):
    cache_file = HISTORY_DIR / f"{market_id}.csv"
    if cache_file.exists():
        try:
            df = pd.read_csv(cache_file, index_col=0, parse_dates=True)
            if len(df) >= 50:
                return df
        except: pass
    return None

def save_history_cache(market_id, df):
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(HISTORY_DIR / f"{market_id}.csv")

def try_yf_download(ticker, period="10y"):
    try:
        import yfinance as yf
        df = yf.download(ticker, period=period, progress=False, threads=False, timeout=20)
        if df is not None and len(df) > 100:
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
            rename = {}
            for c in df.columns:
                cl = c.lower()
                if cl in ("close", "adj close"): rename[c] = "Close"
                elif cl == "volume": rename[c] = "Volume"
            df.rename(columns=rename, inplace=True)
            return df
    except Exception as e:
        log(f"[WARN] yf {ticker}: {e}")
    return None

def get_market_history(market_id, yf_ticker, current_price=None):
    """获取历史数据：缓存 → yfinance下载 → 缓存回退"""
    cached = load_history_cache(market_id)
    today = pd.Timestamp.now()

    # 检查缓存新鲜度
    if cached is not None:
        last = pd.to_datetime(cached.index[-1])
        if (today - last).days <= 3:
            if current_price and "Close" in cached.columns:
                cached.iloc[-1, cached.columns.get_loc("Close")] = current_price
            return cached, True

    # 尝试 yfinance
    if yf_ticker:
        df = try_yf_download(yf_ticker)
        if df is not None and len(df) > 200:
            save_history_cache(market_id, df)
            return df, True

    # 回退到缓存
    if cached is not None:
        if current_price and "Close" in cached.columns:
            cached.iloc[-1, cached.columns.get_loc("Close")] = current_price
        return cached, False

    return None, False

# ============================================================
# History-based Calculations (with fallback)
# ============================================================

def calc_from_history_or_default(market_id, history_df, calc_func, key, current_price=None):
    """尝试从历史数据计算，失败时用默认值"""
    try:
        val = calc_func(history_df, current_price)
        if val is not None:
            return val
    except:
        pass
    defaults = HISTORICAL_DEFAULTS.get(market_id, {})
    return defaults.get(key)

def _calc_cagr_5y(df, price=None):
    if df is None or len(df) < 100: return None
    cutoff = pd.Timestamp.now() - timedelta(days=365*5)
    subset = df.loc[df.index >= cutoff]
    if len(subset) < 50: return None
    start = subset["Close"].iloc[0]
    end = price or subset["Close"].iloc[-1]
    if start <= 0: return None
    years = len(subset) / 252
    if years <= 0: return None
    return round((end / start) ** (1/years) - 1, 6)

def _calc_sharpe_3y(df, price=None):
    if df is None or len(df) < 200: return None
    cutoff = pd.Timestamp.now() - timedelta(days=365*3)
    subset = df.loc[df.index >= cutoff]
    if len(subset) < 100: return None
    rets = subset["Close"].pct_change().dropna()
    if len(rets) < 50: return None
    ann_ret = rets.mean() * 252
    ann_vol = rets.std() * math.sqrt(252)
    if ann_vol <= 0: return None
    return round((ann_ret - RISK_FREE_RATE) / ann_vol, 4)

def _calc_positive_year_ratio_10y(df, price=None):
    if df is None or len(df) < 500: return None
    cutoff = pd.Timestamp.now() - timedelta(days=365*10)
    subset = df.loc[df.index >= cutoff]
    if len(subset) < 500: return None
    yearly = subset["Close"].resample("YE").last()
    if len(yearly) < 5: return None
    yr = yearly.pct_change().dropna()
    if len(yr) == 0: return None
    return round(float((yr > 0).mean()), 4)

def _calc_max_drawdown_10y(df, price=None):
    if df is None or len(df) < 100: return None
    cutoff = pd.Timestamp.now() - timedelta(days=365*10)
    subset = df.loc[df.index >= cutoff]
    if len(subset) < 50: return None
    peak = subset["Close"].cummax()
    dd = (subset["Close"] - peak) / peak
    return round(float(dd.min()), 6)

def _calc_drawdown_recovery_months(df, price=None):
    if df is None or len(df) < 100: return None
    close = df["Close"]
    peak = close.cummax()
    dd = (close - peak) / peak
    in_dd = dd <= -0.15
    if not in_dd.any(): return 0
    last_dd_idx = len(close) - 1
    for i in range(len(close)-1, -1, -1):
        if in_dd.iloc[i]:
            last_dd_idx = i
            break
    else:
        return 0
    peak_val = peak.iloc[last_dd_idx]
    post = close.iloc[last_dd_idx:]
    recovered = (post >= peak_val * 0.98).any()
    if recovered:
        for i in range(len(post)):
            if post.iloc[i] >= peak_val * 0.98:
                trough_idx = close.iloc[last_dd_idx:last_dd_idx+1].index[0]
                months = (post.index[i] - trough_idx).days / 30
                return round(months, 1)
        return 0
    else:
        trough_idx = close.iloc[last_dd_idx:].idxmin()
        months = (pd.Timestamp.now() - trough_idx).days / 30
        return round(months, 1)

def _calc_volatility_20d(df, price=None):
    if df is None or len(df) < 25: return None
    rets = df["Close"].iloc[-21:].pct_change().dropna()
    if len(rets) < 15: return None
    return round(float(rets.std() * math.sqrt(252)), 6)

def _calc_amihud(df, price=None):
    if df is None or len(df) < 25 or "Volume" not in df.columns: return None
    recent = df.iloc[-21:]
    if recent["Volume"].sum() <= 0: return None
    rets = recent["Close"].pct_change().dropna()
    vols = recent["Volume"].iloc[1:]
    if len(rets) != len(vols) or len(rets) == 0: return None
    return round(float((rets.abs() / vols.replace(0, 1)).mean()), 15)

def _calc_correlation_with_us(df, us_df, price=None):
    if df is None or us_df is None: return None
    if len(df) < 200 or len(us_df) < 200: return None
    cutoff = pd.Timestamp.now() - timedelta(days=365*3)
    d1 = df.loc[df.index >= cutoff, "Close"].resample("ME").last().pct_change().dropna()
    d2 = us_df.loc[us_df.index >= cutoff, "Close"].resample("ME").last().pct_change().dropna()
    common = d1.index.intersection(d2.index)
    if len(common) < 20: return None
    corr = np.corrcoef(d1.loc[common].values, d2.loc[common].values)[0, 1]
    return round(float(corr), 4) if not np.isnan(corr) else None

def _calc_pe_percentile(df, current_price, pe_ttm=None):
    if df is None or len(df) < 100 or current_price is None or current_price <= 0:
        return None
    cutoff = pd.Timestamp.now() - timedelta(days=365*10)
    prices = df.loc[df.index >= cutoff, "Close"]
    if len(prices) < 100: return None
    return round(float((prices < current_price).mean()), 4)


# ============================================================
# 六维评分函数（严格按 OPENCLAW.md 公式实现）
# ============================================================

def score_profit_effect(raw):
    """维度一：赚钱效应 (权重 0.25)"""
    cagr = raw.get("cagr_5y")
    sharpe = raw.get("sharpe_3y")
    pos_ratio = raw.get("positive_year_ratio_10y")
    div_yield = raw.get("dividend_buyback_yield")
    recovery = raw.get("drawdown_recovery_months")
    max_dd = raw.get("max_drawdown_10y")

    # sub1: 5年CAGR
    if cagr is not None:
        sub1 = clamp(cagr * 600 + 22, 0, 100)
    else:
        sub1 = 50

    # sub2: 夏普比率
    if sharpe is not None:
        sub2 = clamp(sharpe * 66 + 17, 0, 100)
    else:
        sub2 = 50

    # sub3: 正收益年份占比
    if pos_ratio is not None:
        sub3 = pos_ratio * 100
    else:
        sub3 = 60

    # sub4: 股息+回购收益率
    if div_yield is not None and div_yield >= 0:
        sub4 = clamp(div_yield * 1400, 0, 100)
    else:
        sub4 = 40

    # sub5: 回撤恢复速度
    if recovery is not None and recovery >= 0:
        if recovery <= 3:
            sub5 = 100
        elif recovery <= 6:
            sub5 = 100 - (recovery - 3) * 3.3
        elif recovery <= 12:
            sub5 = 90 - (recovery - 6) * 5
        elif recovery <= 24:
            sub5 = 60 - (recovery - 12) * 3.3
        else:
            sub5 = 20
    else:
        sub5 = 50

    # sub6: 10年最大回撤（反向）
    if max_dd is not None:
        sub6 = clamp(100 + max_dd * 170, 10, 100)
    else:
        sub6 = 50

    score = round(sub1 * 0.25 + sub2 * 0.20 + sub3 * 0.15 + sub4 * 0.15 + sub5 * 0.15 + sub6 * 0.10)
    return clamp(score, 0, 100)


def score_valuation(raw, bond_yield=None):
    """维度二：估值性价比 (权重 0.20)"""
    pe_pct = raw.get("pe_percentile")
    pb_pct = raw.get("pb_percentile")
    cape = raw.get("cape_shiller_pe")
    erp = raw.get("equity_risk_premium")
    be_ratio = raw.get("bond_equity_yield_ratio")
    ev_ebitda = raw.get("ev_ebitda")

    # sub1: PE分位（反向）
    if pe_pct is not None:
        sub1 = (1 - pe_pct) * 100
    else:
        sub1 = 50

    # sub2: PB分位（反向）
    if pb_pct is not None:
        sub2 = (1 - pb_pct) * 100
    else:
        sub2 = 50

    # sub3: CAPE
    if cape is not None and cape > 0:
        sub3 = clamp(130 - cape * 3.5, 10, 100)
    else:
        sub3 = 50

    # sub4: ERP
    if erp is not None:
        sub4 = clamp(erp * 1600 + 15, 0, 100)
    else:
        sub4 = 50

    # sub5: 股债收益比
    if be_ratio is not None and be_ratio >= 0:
        sub5 = clamp(be_ratio * 50, 10, 100)
    else:
        sub5 = 50

    # sub6: EV/EBITDA
    if ev_ebitda is not None and ev_ebitda > 0:
        sub6 = clamp(140 - ev_ebitda * 6, 10, 100)
        has_ev = True
    else:
        sub6 = 50
        has_ev = False

    if has_ev:
        score = round(sub1 * 0.20 + sub2 * 0.15 + sub3 * 0.20 + sub4 * 0.20 + sub5 * 0.15 + sub6 * 0.10)
    else:
        # EV/EBITDA缺失时，权重分配给 sub1 和 sub3
        score = round(sub1 * 0.25 + sub2 * 0.15 + sub3 * 0.25 + sub4 * 0.20 + sub5 * 0.15)

    return clamp(score, 0, 100)


def scale_liquidity(raw):
    """维度三：规模流动性 (权重 0.10)"""
    ff_mcap = raw.get("free_float_market_cap_usd")
    daily_vol = raw.get("daily_volume_usd")
    spread = raw.get("bid_ask_spread_bps")
    amihud = raw.get("amihud_illiquidity")
    turnover = raw.get("turnover_rate")

    # sub1: 自由流通市值
    if ff_mcap is not None and ff_mcap > 0:
        sub1 = clamp(math.log10(ff_mcap) - 9, 0, 4) * 25
    else:
        sub1 = 50

    # sub2: 日均成交额
    if daily_vol is not None and daily_vol > 0:
        sub2 = clamp(math.log10(daily_vol) - 8, 0, 3) * 33
    else:
        sub2 = 50

    # sub3: 买卖价差（反向）
    if spread is not None and spread >= 0:
        sub3 = clamp(120 - spread * 2.2, 10, 100)
    else:
        sub3 = 60

    # sub4: Amihud非流动性（反向）
    if amihud is not None and amihud >= 0:
        sub4 = clamp(100 - math.log10(amihud + 1e-12) * 20 - 60, 10, 100)
    else:
        sub4 = 50

    # sub5: 换手率
    if turnover is not None and turnover >= 0:
        if turnover < 0.002:
            sub5 = 30
        elif turnover < 0.01:
            sub5 = 60
        elif turnover <= 0.03:
            sub5 = 90
        else:
            sub5 = 50
    else:
        sub5 = 60

    score = round(sub1 * 0.25 + sub2 * 0.20 + sub3 * 0.20 + sub4 * 0.20 + sub5 * 0.15)
    return clamp(score, 0, 100)


def score_fundamentals(raw):
    """维度四：经济基本面 (权重 0.15)"""
    gdp = raw.get("gdp_growth_yoy")
    mfg_pmi = raw.get("manufacturing_pmi")
    svc_pmi = raw.get("services_pmi")
    cpi = raw.get("cpi_yoy")
    real_ir = raw.get("real_interest_rate")
    earn_g = raw.get("earnings_growth_yoy")
    credit = raw.get("credit_spread")
    unemp = raw.get("unemployment_rate")

    # sub1: GDP增速
    if gdp is not None:
        sub1 = clamp(gdp * 800 + 30, 0, 100)
    else:
        sub1 = 50

    # sub2: 制造业PMI
    if mfg_pmi is not None:
        sub2 = clamp((mfg_pmi - 40) * 5, 0, 100)
    else:
        sub2 = 50

    # sub3: 服务业PMI
    if svc_pmi is not None:
        sub3 = clamp((svc_pmi - 40) * 5, 0, 100)
        has_svc = True
    else:
        sub3 = 50
        has_svc = False

    # sub4: CPI
    if cpi is not None:
        if cpi < 0.01:
            sub4 = 60
        elif cpi <= 0.03:
            sub4 = 70 + (0.03 - cpi) * 1000
        else:
            sub4 = clamp(100 - (cpi - 0.03) * 2000, 0, 70)
    else:
        sub4 = 60

    # sub5: 实际利率
    if real_ir is not None:
        if real_ir < -0.02:
            sub5 = 40
        elif real_ir < 0:
            sub5 = 50
        elif real_ir <= 0.03:
            sub5 = 70 + real_ir * 1000
        else:
            sub5 = clamp(100 - (real_ir - 0.03) * 2500, 40, 100)
    else:
        sub5 = 60

    # sub6: 盈利增长
    if earn_g is not None:
        sub6 = clamp(earn_g * 300 + 30, 0, 100)
    else:
        sub6 = 50

    # sub7: 信用利差（反向）
    if credit is not None and credit >= 0:
        sub7 = clamp(100 - credit * 2000, 10, 100)
    else:
        sub7 = 60

    # sub8: 失业率（反向）
    if unemp is not None and unemp >= 0:
        sub8 = clamp(110 - unemp * 1000, 10, 100)
    else:
        sub8 = 60

    if has_svc:
        score = round(sub1 * 0.15 + sub2 * 0.10 + sub3 * 0.10 + sub4 * 0.10 + sub5 * 0.10 + sub6 * 0.20 + sub7 * 0.15 + sub8 * 0.10)
    else:
        # 无服务业PMI时，sub3权重分配给sub2
        score = round(sub1 * 0.15 + sub2 * 0.20 + sub4 * 0.10 + sub5 * 0.10 + sub6 * 0.20 + sub7 * 0.15 + sub8 * 0.10)

    return clamp(score, 0, 100)


def score_institutional(raw):
    """维度五：制度可进入性 (权重 0.15)"""
    f_ol = raw.get("foreign_ownership_limit")
    cff = raw.get("capital_flow_freedom")
    etf = raw.get("etf_available")
    sd = raw.get("settlement_days")
    wt = raw.get("withholding_tax")
    ipi = raw.get("investor_protection_index")
    acs = raw.get("accounting_standards")
    mt = raw.get("market_transparency")
    dla = raw.get("dual_listing_accessibility")

    sub1 = (f_ol if f_ol is not None else 0.5) * 100
    sub2 = (cff if cff is not None else 0.5) * 100
    sub3 = 100 if etf else 20

    if sd is not None:
        if sd <= 2:
            sub4 = 100
        elif sd <= 3:
            sub4 = 70
        else:
            sub4 = 40
    else:
        sub4 = 70

    if wt is not None:
        sub5 = (1 - wt) * 100
    else:
        sub5 = 70

    sub6 = (ipi if ipi is not None else 5.0) * 10
    sub7 = (acs if acs is not None else 0.5) * 100
    sub8 = (mt if mt is not None else 0.5) * 100
    sub9 = 100 if dla else 30

    score = round(sub1 * 0.12 + sub2 * 0.12 + sub3 * 0.08 + sub4 * 0.08 + sub5 * 0.10
                  + sub6 * 0.15 + sub7 * 0.12 + sub8 * 0.13 + sub9 * 0.10)
    return clamp(score, 0, 100)


def score_risk_penalty(raw):
    """维度六：风险惩罚 (权重 0.15) - 得分越高=惩罚越大=风险越高"""
    max_dd = raw.get("max_drawdown_10y")
    curr_dev = raw.get("currency_devaluation_5y")
    cds = raw.get("sovereign_cds_spread")
    corr = raw.get("correlation_with_us")
    gpr = raw.get("geopolitical_risk_index")
    ccr = raw.get("capital_control_risk")

    # sub1: 10年最大回撤
    if max_dd is not None and max_dd < 0:
        sub1 = clamp(abs(max_dd) * 170, 0, 100)
    else:
        sub1 = 30

    # sub2: 货币贬值（正数=贬值，对境外投资者是亏损）
    if curr_dev is not None:
        sub2 = clamp(curr_dev * 200 + 5, 0, 100)
    else:
        sub2 = 20

    # sub3: 主权CDS利差
    if cds is not None and cds >= 0:
        sub3 = clamp(cds * 0.2, 0, 100)
    else:
        sub3 = 30

    # sub4: 与美股相关性（反向：低相关=分散化价值=惩罚轻）
    if corr is not None:
        sub4 = clamp(corr * 87.5, 10, 100)
    else:
        sub4 = 40

    # sub5: 地缘政治风险
    if gpr is not None and gpr >= 0:
        sub5 = clamp(gpr, 0, 100)
    else:
        sub5 = 30

    # sub6: 资本管制风险
    if ccr is not None and ccr >= 0:
        sub6 = ccr * 100
    else:
        sub6 = 20

    score = round(sub1 * 0.20 + sub2 * 0.20 + sub3 * 0.20 + sub4 * 0.10 + sub5 * 0.15 + sub6 * 0.15)
    return clamp(score, 0, 100)


# ============================================================
# 汇率获取 (用于 currency_devaluation_5y)
# ============================================================

def fetch_fx_rate(base, quote="USD"):
    """获取当前汇率 (base/quote)，例如 fetch_fx_rate('JPY') = USD/JPY"""
    try:
        import yfinance as yf
        pair = f"{base}{quote}=X"
        tk = yf.Ticker(pair)
        data = tk.history(period="5d")
        if data is not None and len(data) > 0:
            return float(data["Close"].iloc[-1])
    except Exception as e:
        log(f"[WARN] FX rate {base}/{quote}: {e}")
    return None


def fetch_fx_history_5y(base, quote="USD"):
    """获取5年汇率历史，用于计算货币贬值幅度"""
    try:
        import yfinance as yf
        pair = f"{base}{quote}=X"
        df = yf.download(pair, period="5y", progress=False, threads=False, timeout=20)
        if df is not None and len(df) > 200:
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
            return df
    except Exception as e:
        log(f"[WARN] FX history {base}/{quote}: {e}")
    return None


def calc_currency_devaluation_5y(base_currency, usd_cross_pair=None):
    """
    计算5年累计货币贬值/升值幅度
    base_currency: 市场货币代码 (USD, JPY, EUR...)
    返回: 正数=贬值(对境外投资者不利), 负数=升值
    注意：USD交叉汇率的含义取决于pair方向
    """
    # static_data中已有默认值，这里尝试实时计算
    cache_file = HISTORY_DIR / f"fx_{base_currency}_USD.csv"
    
    # 尝试从缓存或yfinance获取
    df = load_history_cache(f"fx_{base_currency}_USD")
    today = pd.Timestamp.now()
    
    if df is not None:
        last = pd.to_datetime(df.index[-1])
        if (today - last).days > 3:
            # 尝试刷新
            new_df = fetch_fx_history_5y(base_currency)
            if new_df is not None:
                save_history_cache(f"fx_{base_currency}_USD", new_df)
                df = new_df
    else:
        new_df = fetch_fx_history_5y(base_currency)
        if new_df is not None:
            save_history_cache(f"fx_{base_currency}_USD", new_df)
            df = new_df
    
    if df is not None and len(df) >= 200:
        # 确保是 Close 列
        col = "Close"
        if col not in df.columns:
            col = df.columns[0]
        now_rate = float(df[col].iloc[-1])
        ago_rate = float(df[col].iloc[0])
        if ago_rate > 0:
            # 对于非USD货币对 USD：例如 JPYUSD，rate下降=JPY贬值
            change = (now_rate - ago_rate) / ago_rate
            return round(change, 4)
    
    return None  # 回退到 static_data 默认值


# ============================================================
# 数据组装
# ============================================================

def build_market_entry(market_cfg, static, price_data, hist_data, us_hist,
                        bond_yield, a_share_data, multpl_data):
    """
    把所有原始指标组装成一个完整的 market entry
    market_cfg: MARKETS 列表中的市场配置
    static: static_data[market_id] 搜索整理类指标
    price_data: dict with 'price', 'low_52w', 'high_52w' (CNBC) or close/volume (tencent)
    hist_data: 该市场的 DataFrame 或 None
    us_hist: 美国S&P500 DataFrame（用于计算相关性）
    bond_yield: 该市场10年期国债收益率
    a_share_data: AKShare A股估值数据 (仅 cn_ashare)
    multpl_data: dict with 'cape', 'bond_10y' from multpl.com
    """
    mid = market_cfg["market"]
    current_price = None
    
    # 获取当前价格
    if price_data:
        if "price" in price_data and price_data["price"]:
            current_price = price_data["price"]
        elif "close" in price_data and price_data["close"]:
            current_price = price_data["close"]
    
    # 合并 static 数据作为基础
    raw = dict(static)
    
    # 添加宏观经济默认值
    raw["gdp_growth_yoy"] = DEFAULT_GDP.get(mid, 0.03)
    raw["cpi_yoy"] = DEFAULT_CPI.get(mid, 0.02)
    policy_rate = DEFAULT_POLICY.get(mid, 0.03)
    cpi = raw["cpi_yoy"]
    raw["real_interest_rate"] = round(policy_rate - cpi, 4)
    
    # 填充 bond_yield
    if bond_yield is not None:
        raw["_bond_yield"] = bond_yield
    
    # 从历史数据计算可算指标
    hist = hist_data
    
    raw["cagr_5y"] = calc_from_history_or_default(mid, hist, _calc_cagr_5y, "cagr_5y", current_price)
    raw["sharpe_3y"] = calc_from_history_or_default(mid, hist, _calc_sharpe_3y, "sharpe_3y", current_price)
    raw["positive_year_ratio_10y"] = calc_from_history_or_default(mid, hist, _calc_positive_year_ratio_10y, "positive_year_ratio_10y", current_price)
    raw["max_drawdown_10y"] = calc_from_history_or_default(mid, hist, _calc_max_drawdown_10y, "max_drawdown_10y", current_price)
    raw["drawdown_recovery_months"] = calc_from_history_or_default(mid, hist, _calc_drawdown_recovery_months, "drawdown_recovery_months", current_price)
    raw["volatility_20d"] = calc_from_history_or_default(mid, hist, _calc_volatility_20d, "volatility_20d", current_price)
    raw["amihud_illiquidity"] = calc_from_history_or_default(mid, hist, _calc_amihud, "amihud_illiquidity", current_price)
    
    # 与美股相关性
    corr = _calc_correlation_with_us(hist, us_hist, current_price)
    if corr is None:
        corr = HISTORICAL_DEFAULTS.get(mid, {}).get("correlation_with_us")
    raw["correlation_with_us"] = corr
    
    # PE/PB 百分位
    if hist is not None and current_price and current_price > 0:
        pe_pct = _calc_pe_percentile(hist, current_price)
        if pe_pct is not None:
            raw["pe_percentile"] = pe_pct
        elif "pe_percentile" not in raw:
            raw["pe_percentile"] = HISTORICAL_DEFAULTS.get(mid, {}).get("pe_percentile", 0.5)
    elif "pe_percentile" not in raw:
        raw["pe_percentile"] = HISTORICAL_DEFAULTS.get(mid, {}).get("pe_percentile", 0.5)
    
    if "pb_percentile" not in raw or raw.get("pb_percentile") is None:
        raw["pb_percentile"] = HISTORICAL_DEFAULTS.get(mid, {}).get("pb_percentile", 0.5)
    
    # PE_TTM: 从 multpl.com (us_sp500) 或 DEFAULT_PE 回退
    if "pe_ttm" not in raw or not raw.get("pe_ttm"):
        if mid == "us_sp500" and multpl_data and multpl_data.get("pe"):
            raw["pe_ttm"] = multpl_data["pe"]
        else:
            raw["pe_ttm"] = DEFAULT_PE.get(mid, 16.0)
    
    # A股特殊处理
    if mid == "cn_ashare" and a_share_data:
        if "pe_ttm" in a_share_data and a_share_data["pe_ttm"]:
            raw["pe_ttm"] = a_share_data["pe_ttm"]
        if "pe_percentile" in a_share_data and a_share_data["pe_percentile"] is not None:
            raw["pe_percentile"] = a_share_data["pe_percentile"]
        if "pb_percentile" in a_share_data and a_share_data["pb_percentile"] is not None:
            raw["pb_percentile"] = a_share_data["pb_percentile"]
    
    # multpl.com 数据 (美股 CAPE 和 10Y国债)
    if mid == "us_sp500" and multpl_data:
        if multpl_data.get("cape"):
            raw["cape_shiller_pe"] = multpl_data["cape"]
        if multpl_data.get("bond_10y"):
            bond_yield = multpl_data["bond_10y"] / 100.0
    
    # 计算衍生指标
    pe_ttm = raw.get("pe_ttm")
    if pe_ttm and pe_ttm > 0 and bond_yield and bond_yield > 0:
        raw["equity_risk_premium"] = round(1.0 / pe_ttm - bond_yield, 6)
    elif "equity_risk_premium" not in raw:
        raw["equity_risk_premium"] = 0.03
    
    div_yield = raw.get("dividend_buyback_yield", 0.03)
    by = raw.get("_bond_yield") or bond_yield
    if by and by > 0 and div_yield and div_yield > 0:
        raw["bond_equity_yield_ratio"] = round(div_yield / by, 4)
    elif "bond_equity_yield_ratio" not in raw:
        raw["bond_equity_yield_ratio"] = 1.0
    
    # 日均成交额和换手率 (基于价格数据和市值)
    if price_data and "volume" in price_data and price_data["volume"]:
        vol = price_data["volume"]
        ff_mcap = raw.get("free_float_market_cap_usd")
        currency = market_cfg.get("currency", "USD")
        
        # 腾讯API返回的是人民币/港币成交额（手数*100股），需要转换
        if market_cfg.get("tencent"):
            # 腾讯返回的 volume 是成交量（股），需乘以价格得到成交额
            if current_price:
                vol_usd = vol * current_price
                # CNY/HKD → USD 转换（近似）
                fx_rate = raw.get("_fx_rate", 7.2 if currency == "CNY" else 7.8 if currency == "HKD" else 1.0)
                raw["daily_volume_usd"] = round(vol_usd / fx_rate, 2)
        else:
            raw["daily_volume_usd"] = vol
        
        if ff_mcap and ff_mcap > 0:
            dv = raw.get("daily_volume_usd", 0)
            if dv and dv > 0:
                raw["turnover_rate"] = round(dv / ff_mcap, 6)
    elif "daily_volume_usd" not in raw:
        raw["daily_volume_usd"] = HISTORICAL_DEFAULTS.get(mid, {}).get("daily_volume_usd", 1e9)
    if "turnover_rate" not in raw or raw.get("turnover_rate") is None:
        raw["turnover_rate"] = 0.01
    
    # 货币贬值
    curr_dev = calc_currency_devaluation_5y(market_cfg["currency"])
    if curr_dev is not None:
        # 需要区分方向：对于非USD货币，fx pair 是 XXXUSD=X
        # 如果XXX是基础货币，rate下降=XXX升值(对USD贬值)
        # 这里统一处理：正数=该货币相对USD贬值
        raw["currency_devaluation_5y"] = curr_dev
    elif "currency_devaluation_5y" not in raw:
        # 使用 static 默认值（来自 OPENCLAW.md 风险惩罚表）
        dev_defaults = {"us_sp500":0.0,"jp":-0.20,"gb":-0.15,"de":-0.18,"fr":-0.18,
            "au":-0.20,"ca":-0.15,"cn_ashare":-0.08,"cn_hk":-0.02,"kr":-0.10,
            "tw":-0.08,"in":-0.22,"vn":-0.15,"br":-0.30}
        raw["currency_devaluation_5y"] = dev_defaults.get(mid, 0.0)
    
    # 清理内部字段
    raw.pop("_bond_yield", None)
    raw.pop("_fx_rate", None)
    
    # ---- 计算六维评分 ----
    dim_pe = score_profit_effect(raw)
    dim_val = score_valuation(raw, bond_yield)
    dim_sl = scale_liquidity(raw)
    dim_fun = score_fundamentals(raw)
    dim_ins = score_institutional(raw)
    dim_risk = score_risk_penalty(raw)
    
    # fish_score
    fish = round(
        dim_pe * 0.25
        + dim_val * 0.20
        + dim_sl * 0.10
        + dim_fun * 0.15
        + dim_ins * 0.15
        + dim_risk * 0.15
    )
    
    dimensions = {
        "profit_effect":    {"score": dim_pe,  "weight": 0.25},
        "valuation":        {"score": dim_val, "weight": 0.20},
        "scale_liquidity":  {"score": dim_sl,  "weight": 0.10},
        "fundamentals":     {"score": dim_fun, "weight": 0.15},
        "institutional":    {"score": dim_ins, "weight": 0.15},
        "risk_penalty":     {"score": dim_risk,"weight": 0.15},
    }
    
    return {
        "market": mid,
        "market_name": market_cfg["market_name"],
        "index_name": market_cfg["index_name"],
        "fish_score": fish,
        "dimensions": dimensions,
        "raw_indicators": raw,
    }


# ============================================================
# 主函数
# ============================================================

def main():
    log("=== ValueScope 每日数据采集 ===")
    
    # 1. 判断最近交易日日期
    trade_date = get_latest_trade_date()
    log(f"最近交易日: {trade_date}")
    
    # 2. 检查是否已有当日数据
    output_file = DATA_DIR / f"{trade_date}.json"
    if output_file.exists():
        log(f"当日数据已存在: {output_file}")
        try:
            existing = json.loads(output_file.read_text())
            if len(existing.get("markets", [])) >= 10:
                log("已有足够市场数据，跳过采集")
                return
        except:
            pass
    
    # 3. 加载 static_data.json
    static = load_static_data()
    log(f"已加载 static_data ({len(static)} 个市场)")
    
    # 4. CNBC 实时价格 (14个有CNBC代码的市场)
    cnbc_prices = {}
    for m in MARKETS:
        if m.get("cnbc"):
            log(f"  CNBC {m['cnbc']} ({m['market_name']})...")
            data = fetch_cnbc_price(m["cnbc"])
            if data:
                cnbc_prices[m["market"]] = data
            time.sleep(random.uniform(1.0, 2.0))  # 避免被封
    log(f"CNBC 获取完成: {len(cnbc_prices)}/{len([m for m in MARKETS if m.get('cnbc')])}")
    
    # 5. 腾讯API价格 (A股、港股)
    tencent_syms = [m["tencent"] for m in MARKETS if m.get("tencent")]
    tencent_prices = fetch_tencent_prices(tencent_syms)
    log(f"腾讯API获取完成: {len(tencent_prices)}")
    
    # 6. AKShare A股估值
    a_share_data = fetch_a_share_valuation()
    log(f"A股估值: {a_share_data}")
    
    # 7. multpl.com (标普CAPE, 10Y国债)
    multpl_data = {}
    cape = fetch_multpl_val("shiller-pe")
    if cape: multpl_data["cape"] = cape
    bond_10y = fetch_multpl_val("10-year-treasury-rate")
    if bond_10y: multpl_data["bond_10y"] = bond_10y
    pe_ttm_multpl = fetch_multpl_val("s-p-500-pe-ratio")
    if pe_ttm_multpl: multpl_data["pe"] = pe_ttm_multpl
    log(f"multpl.com: CAPE={cape}, PE={pe_ttm_multpl}, 10Y={bond_10y}")
    
    # 8. yfinance 批量下载历史数据
    hist_cache = {}
    us_hist = None
    
    # 先下载美股数据
    log("下载历史数据...")
    for m in MARKETS:
        mid = m["market"]
        yf_ticker = m.get("yf")
        price_info = cnbc_prices.get(mid) or (
            {"close": tencent_prices.get(m["tencent"], {}).get("close")}
            if m.get("tencent") and m["tencent"] in tencent_prices else None
        )
        current_price = None
        if price_info:
            if "price" in price_info:
                current_price = price_info["price"]
            elif "close" in price_info:
                current_price = price_info["close"]

        # 越南 VN-Index 特殊处理 (无 CNBC/yfinance)
        if mid == "vn" and not current_price:
            vn_price = fetch_vnindex()
            if vn_price:
                cnbc_prices[mid] = {"price": vn_price}
                current_price = vn_price

        hist_df, hist_ok = get_market_history(mid, yf_ticker, current_price)
        hist_cache[mid] = hist_df
        if mid == "us_sp500" and hist_df is not None:
            us_hist = hist_df

        time.sleep(0.3)  # yfinance 间隔

    log(f"历史数据下载完成: {sum(1 for v in hist_cache.values() if v is not None)}/{len(MARKETS)}")

    # 9. 对每个市场：组装指标 → 计算评分 → 生成 entry
    entries = []
    for m in MARKETS:
        mid = m["market"]
        log(f"  处理 {m['market_name']} ({mid})...")

        # 合并价格数据
        price_data = cnbc_prices.get(mid)
        if not price_data and m.get("tencent") and m["tencent"] in tencent_prices:
            price_data = tencent_prices[m["tencent"]]

        hist_df = hist_cache.get(mid)
        bond_yield = DEFAULT_BOND.get(mid, 0.03)
        a_data = a_share_data if mid == "cn_ashare" else None

        try:
            entry = build_market_entry(
                market_cfg=m,
                static=static.get(mid, {}),
                price_data=price_data,
                hist_data=hist_df,
                us_hist=us_hist,
                bond_yield=bond_yield,
                a_share_data=a_data,
                multpl_data=multpl_data,
            )
            entries.append(entry)
            log(f"    fish_score={entry['fish_score']} | "
                f"profit={entry['dimensions']['profit_effect']['score']} "
                f"valu={entry['dimensions']['valuation']['score']} "
                f"scale={entry['dimensions']['scale_liquidity']['score']} "
                f"fund={entry['dimensions']['fundamentals']['score']} "
                f"inst={entry['dimensions']['institutional']['score']} "
                f"risk={entry['dimensions']['risk_penalty']['score']}")
        except Exception as e:
            log(f"    [ERROR] {mid}: {e}")
            import traceback; traceback.print_exc()

    if not entries:
        log("[FATAL] 没有成功生成任何市场数据")
        sys.exit(1)

    # 10. 输出 JSON
    report = {
        "date": trade_date,
        "markets": entries,
    }

    output_file.parent.mkdir(parents=True, exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    log(f"输出文件: {output_file} ({len(entries)} 个市场)")

    # 11. git commit & push
    try:
        sp.run(["git", "add", str(output_file)], cwd=str(PROJECT_DIR), check=True, capture_output=True)
        result = sp.run(["git", "commit", "-m", f"📊 {trade_date}: update market data ({len(entries)} markets)"],
                       cwd=str(PROJECT_DIR), capture_output=True, text=True)
        if result.returncode == 0:
            log(f"Git commit: {result.stdout.strip()}")
            push_result = sp.run(["git", "push"], cwd=str(PROJECT_DIR), capture_output=True, text=True, timeout=30)
            if push_result.returncode == 0:
                log("Git push 成功")
            else:
                log(f"Git push 失败: {push_result.stderr.strip()}")
        else:
            log(f"Git commit: 无变更或失败")
    except Exception as e:
        log(f"[WARN] git 操作: {e}")

    log("=== 采集完成 ===")


if __name__ == "__main__":
    import random
    main()

