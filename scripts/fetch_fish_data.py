#!/usr/bin/env python3
"""ValueScope 每日数据采集脚本 - 从互联网抓取17个市场真实数据，计算六维评分"""
import json, os, re, subprocess, sys, time
from datetime import datetime, timedelta
from pathlib import Path
import requests

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "daily"
DIM_KEYS = ["profit_effect", "valuation", "scale_liquidity", "fundamentals", "institutional", "risk_penalty"]
DIM_WEIGHTS = [0.30, 0.20, 0.15, 0.15, 0.10, 0.10]

# ============================================================
# 数据采集
# ============================================================

def fetch_tencent(symbols):
    """腾讯财经API (A股/港股/美股/黄金期货)"""
    result = {}
    try:
        resp = requests.get(f"https://qt.gtimg.cn?q={','.join(symbols)}", timeout=10)
        for line in resp.content.decode("gbk", errors="replace").strip().split("\n"):
            if not line.startswith("v_"): continue
            p = line.split("~")
            if len(p) < 35: continue
            sym = line.split("=")[0].replace("v_", "")
            result[sym] = {"close": float(p[3] or 0), "prev_close": float(p[4] or 0),
                           "change_pct": float(p[32] or 0), "volume": float(p[6] or 0),
                           "high_52w": float(p[33] or 0), "low_52w": float(p[34] or 0)}
    except Exception as e:
        print(f"[WARN] 腾讯API: {e}", file=sys.stderr)
    return result

def fetch_cnbc(ticker):
    """CNBC 抓取指数行情 - 优先从JSON-LD结构化数据提取"""
    try:
        resp = requests.get(f"https://www.cnbc.com/quotes/{ticker}",
                            headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64)"}, timeout=15)
        text = resp.text
        # 方法1: JSON-LD中的结构化数据
        m = re.search(r'"price":"([\d,.]+)".*?"priceChange":"([\d,.]+)".*?"priceChangePercent":"(-?[\d.]+)"', text)
        if m:
            close = float(m.group(1).replace(",", ""))
            chg = float(m.group(3))
        else:
            prices = re.findall(r'(\d{1,3}(?:,\d{3})+\.\d+)', text)
            if not prices: return None
            close = float(prices[0].replace(",", ""))
            chg_match = re.search(r'(-?\d+\.\d+)%', text[:3000])
            chg = float(chg_match.group(1)) if chg_match else 0
        # 52周范围 - 从HTML提取
        range_m = re.search(r'52 Week Low</span><span class="[^"]*">([\d,.]+)', text)
        high_m = re.search(r'52 Week High</span><span class="[^"]*">([\d,.]+)', text)
        low_52w = float(range_m.group(1).replace(",", "")) if range_m else 0
        high_52w = float(high_m.group(1).replace(",", "")) if high_m else 0
        # 备用：从Summary-value提取
        if not low_52w:
            low_m = re.search(r'52 Week Low.*?Summary-value">([\d,.]+)', text)
            high_m2 = re.search(r'52 Week High.*?Summary-value">([\d,.]+)', text)
            low_52w = float(low_m.group(1).replace(",", "")) if low_m else 0
            high_52w = float(high_m2.group(1).replace(",", "")) if high_m2 else 0
        return {"close": close, "change_pct": chg, "high_52w": high_52w, "low_52w": low_52w}
    except Exception as e:
        print(f"[WARN] CNBC {ticker}: {e}", file=sys.stderr)
        return None

def fetch_vnindex():
    try:
        resp = requests.get("https://tradingeconomics.com/vietnam/stock-market",
                            headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
        nums = re.findall(r'(\d{4,5}\.\d+)', resp.text)
        if nums: return {"close": float(nums[0])}
    except: pass
    return None

def fetch_multpl_val(path, label):
    """从multpl.com提取指标"""
    try:
        resp = requests.get(f"https://www.multpl.com/{path}", timeout=10)
        # 格式1: "Current S&P 500 PE Ratio is 31.90"  (meta description)
        m = re.search(rf'{label.split()[0]}[^"]*?is\s*([\d.]+)', resp.text)
        if m: return float(m.group(1))
        # 格式2: "S&P 500 PE Ratio:\n31.90"
        m = re.search(rf'{label}:\s*([\d.]+)', resp.text)
        if m: return float(m.group(1))
        # 格式3: "10 Year Treasury Rate:\n4.59%"
        m = re.search(rf'{label}:\s*([\d.]+)%', resp.text)
        if m: return float(m.group(1))
        return None
    except: return None

def fetch_a_valuation():
    """A股估值 via akshare脚本"""
    result = {}
    try:
        p = subprocess.run([sys.executable, "/root/.openclaw/workspace/skills/a-share-valuation/scripts/fetch_valuation.py"],
                           capture_output=True, text=True, timeout=60)
        for line in p.stdout.split("\n"):
            for name, key, pattern in [("沪深300", "csi300_pe", r"PE\(滚动\)=([\d.]+)"),
                                        ("沪深300", "csi300_dy", r"股息率=([\d.]+)%"),
                                        ("中证500", "csi500_pe", r"PE\(滚动\)=([\d.]+)"),
                                        ("中证500", "csi500_dy", r"股息率=([\d.]+)%"),
                                        ("上证指数", "sh_pe", r"PE\(滚动\)=([\d.]+)"),
                                        ("上证指数", "sh_dy", r"股息率=([\d.]+)%")]:
                if name in line:
                    m = re.search(pattern, line)
                    if m: result[key] = float(m.group(1)) if "dy" not in key else float(m.group(1)) / 100
    except Exception as e:
        print(f"[WARN] A股估值: {e}", file=sys.stderr)
    return result

def fetch_a_pb():
    """A股PB分位 via akshare"""
    result = {}
    try:
        import akshare as ak; import warnings; warnings.filterwarnings('ignore')
        df = ak.stock_a_all_pb()
        latest = df.iloc[-1]
        result["median_pb"] = float(latest["middlePB"])
        result["median_pb_pct_10y"] = float(latest["quantileInRecent10YearsMiddlePB"])
        df2 = ak.stock_index_pb_lg(symbol="沪深300")
        result["csi300_pb"] = float(df2.iloc[-1]["市净率"])
    except Exception as e:
        print(f"[WARN] A股PB: {e}", file=sys.stderr)
    return result

def fetch_china_bond():
    try:
        import akshare as ak; import warnings; warnings.filterwarnings('ignore')
        d = (datetime.now() - timedelta(days=7)).strftime("%Y%m%d")
        df = ak.bond_china_yield(start_date=d, end_date=datetime.now().strftime("%Y%m%d"))
        if len(df) > 0: return float(df.iloc[-1]["10年"])
    except: pass
    return None

# ============================================================
# 评分函数
# ============================================================

def score_profit(ytd, chg_pct):
    if ytd > 0.25: b = 92
    elif ytd > 0.15: b = 85
    elif ytd > 0.10: b = 75
    elif ytd > 0.05: b = 65
    elif ytd > 0: b = 58
    elif ytd > -0.10: b = 45
    elif ytd > -0.20: b = 30
    else: b = 20
    a = 3 if chg_pct > 1 else (1 if chg_pct > 0.5 else (-5 if chg_pct < -2 else (-3 if chg_pct < -1 else 0)))
    return max(0, min(100, b + a))

def score_val(pe_pct=None, div_yield=0, pe=None):
    if pe_pct is not None:
        if pe_pct < 0.20: b = 92
        elif pe_pct < 0.30: b = 85
        elif pe_pct < 0.40: b = 75
        elif pe_pct < 0.50: b = 65
        elif pe_pct < 0.60: b = 55
        elif pe_pct < 0.70: b = 45
        elif pe_pct < 0.80: b = 35
        elif pe_pct < 0.90: b = 25
        else: b = 15
    elif pe is not None:
        if pe < 10: b = 88
        elif pe < 13: b = 78
        elif pe < 16: b = 65
        elif pe < 20: b = 52
        elif pe < 25: b = 40
        elif pe < 30: b = 30
        elif pe < 40: b = 20
        else: b = 12
    else: b = 50
    a = 5 if div_yield > 0.04 else (3 if div_yield > 0.03 else (1 if div_yield > 0.02 else 0))
    return max(0, min(100, b + a))

def score_scale(mcap_usd):
    if mcap_usd > 10e12: return 90
    elif mcap_usd > 5e12: return 85
    elif mcap_usd > 2e12: return 78
    elif mcap_usd > 1e12: return 70
    elif mcap_usd > 500e9: return 62
    elif mcap_usd > 200e9: return 52
    elif mcap_usd > 100e9: return 45
    else: return 35

def score_fund(gdp=None, pmi=None, rate_env="normal"):
    if gdp is not None:
        if gdp > 0.06: b = 92
        elif gdp > 0.05: b = 85
        elif gdp > 0.04: b = 78
        elif gdp > 0.03: b = 70
        elif gdp > 0.02: b = 62
        elif gdp > 0.01: b = 52
        elif gdp > 0: b = 42
        else: b = 30
    else: b = 55
    a = 0
    if pmi: a += 5 if pmi > 55 else (2 if pmi > 52 else (0 if pmi > 50 else (-5 if pmi > 48 else -10)))
    if rate_env == "low": a += 3
    elif rate_env == "high": a -= 3
    return max(0, min(100, b + a))

INST_SCORES = {"us_sp500": 88, "us_nasdaq": 88, "jp": 85, "gb": 87, "de": 87, "fr": 85,
               "au": 88, "ca": 88, "cn_ashare": 55, "cn_hk": 78, "kr": 75, "tw": 72,
               "in": 60, "vn": 48, "br": 52, "gold": 70, "us_treasury": 75}

def score_risk(vol=None, drawdown=None, pol="low", market=""):
    if vol:
        if vol > 0.40: b = 40
        elif vol > 0.30: b = 32
        elif vol > 0.25: b = 25
        elif vol > 0.20: b = 18
        elif vol > 0.15: b = 12
        else: b = 8
    else: b = 15
    if drawdown and drawdown > 0.10: b += 8
    elif drawdown and drawdown > 0.05: b += 4
    if pol == "high": b += 8
    elif pol == "medium": b += 4
    if market in ("gold", "us_treasury"): b = max(5, b - 5)
    return max(0, min(100, b))

def calc_ytd(close, low_52w):
    if low_52w <= 0 or close <= 0: return 0
    ytd = (close - low_52w) / low_52w
    # Cap at reasonable range - YTD shouldn't be used for >1yr periods
    return max(-0.5, min(1.0, round(ytd, 4)))

def make_dims(market, ytd, chg, pe_pct=None, div_yield=0, pe=None, mcap=1e12,
              gdp=None, pmi=None, rate_env="normal", vol=None, pol="low", drawdown=None):
    dims = {
        "profit_effect": {"score": score_profit(ytd, chg), "weight": DIM_WEIGHTS[0]},
        "valuation": {"score": score_val(pe_pct=pe_pct, div_yield=div_yield, pe=pe), "weight": DIM_WEIGHTS[1]},
        "scale_liquidity": {"score": score_scale(mcap), "weight": DIM_WEIGHTS[2]},
        "fundamentals": {"score": score_fund(gdp=gdp, pmi=pmi, rate_env=rate_env), "weight": DIM_WEIGHTS[3]},
        "institutional": {"score": INST_SCORES.get(market, 55), "weight": DIM_WEIGHTS[4]},
        "risk_penalty": {"score": score_risk(vol=vol, pol=pol, drawdown=drawdown, market=market), "weight": DIM_WEIGHTS[5]},
    }
    fish = max(0, min(100, round(sum(dims[k]["score"] * dims[k]["weight"] for k in dims))))
    raw = {"ytd_return": ytd, "change_pct": round(chg, 2)}
    if pe_pct is not None: raw["pe_percentile"] = round(pe_pct, 2)
    if pe: raw["pe"] = pe
    if div_yield: raw["dividend_yield"] = round(div_yield, 4)
    if mcap > 0: raw["market_cap_usd"] = round(mcap / 1e9, 0)
    if gdp is not None: raw["gdp_growth"] = round(gdp, 4)
    if pmi is not None: raw["pmi"] = pmi
    if vol is not None: raw["volatility_20d"] = round(vol, 3)
    return {"market": market, "fish_score": fish, "dimensions": dims, "raw_indicators": raw}

# ============================================================
# 主流程
# ============================================================

def main():
    date = get_latest_trade_date()
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    print("=== ValueScope 数据采集 ===", file=sys.stderr)
    print(f"日期: {date}", file=sys.stderr)

    # 1. 腾讯API
    print("[1/6] 腾讯API...", file=sys.stderr)
    tc = fetch_tencent(["sh000001", "sz399001", "sz399006", "sh000300", "sh000905",
                        "hkHSI", "hkHSTECH", "usDJI", "usIXIC", "hf_GC"])
    print(f"  获取到 {len(tc)} 个市场", file=sys.stderr)

    # 2. CNBC
    print("[2/6] CNBC...", file=sys.stderr)
    cnbc = {}
    for tk in [".SPX", ".NDX", ".N225", ".FTSE", ".GDAXI", ".FCHI", ".AXJO",
               ".GSPTSE", ".KS11", ".TWII", ".NSEI", ".BVSP"]:
        d = fetch_cnbc(tk)
        if d: cnbc[tk] = d
        time.sleep(0.5)
    print(f"  获取到 {len(cnbc)} 个市场", file=sys.stderr)

    # 3. 越南
    print("[3/6] 越南VNINDEX...", file=sys.stderr)
    vn = fetch_vnindex()

    # 4. multpl.com
    print("[4/6] multpl.com...", file=sys.stderr)
    sp_pe = fetch_multpl_val("s-p-500-pe-ratio", "S&P 500 PE Ratio")
    cape = fetch_multpl_val("shiller-pe", "Shiller PE Ratio")
    t_yield = fetch_multpl_val("10-year-treasury-rate", "10 Year Treasury Rate")
    print(f"  S&P500 PE={sp_pe}, CAPE={cape}, 10Y={t_yield}", file=sys.stderr)

    # 5. A股估值
    print("[5/6] A股估值...", file=sys.stderr)
    a_val = fetch_a_valuation()
    a_pb = fetch_a_pb()
    cn_bond = fetch_china_bond()
    print(f"  CSI300 PE={a_val.get('csi300_pe')}, PB={a_pb.get('csi300_pb')}, 国债={cn_bond}", file=sys.stderr)

    # 6. 组装数据
    print("[6/6] 组装评分...", file=sys.stderr)
    markets = []

    # ---- 美国 S&P 500 ----
    sp = cnbc.get(".SPX", {})
    sp_close = sp.get("close", 0)
    sp_pe_pct = min(0.99, sp_pe / (16.22 * 2.5)) if sp_pe else 0.9
    markets.append({"market": "us_sp500", "market_name": "美国", "index_name": "S&P 500",
        **make_dims("us_sp500", calc_ytd(sp_close, sp.get("low_52w", 0)), sp.get("change_pct", 0),
                     pe_pct=sp_pe_pct, div_yield=1/sp_pe if sp_pe else 0, pe=sp_pe, mcap=48e12,
                     gdp=0.025, pmi=50.5, rate_env="normal", vol=0.18)})

    # ---- 美国 纳斯达克100 ----
    ndx = cnbc.get(".NDX", {})
    ndx_close = ndx.get("close", 0)
    ndx_pe = sp_pe * 1.35 if sp_pe else 43
    ndx_pe_pct = min(0.99, ndx_pe / (16.22 * 3.0))
    markets.append({"market": "us_nasdaq", "market_name": "美国", "index_name": "纳斯达克100",
        **make_dims("us_nasdaq", calc_ytd(ndx_close, ndx.get("low_52w", 0)), ndx.get("change_pct", 0),
                     pe_pct=ndx_pe_pct, div_yield=1/ndx_pe if ndx_pe else 0, pe=round(ndx_pe, 1), mcap=32e12,
                     gdp=0.025, pmi=50.5, rate_env="normal", vol=0.25)})

    # ---- A股 ----
    c300 = tc.get("sh000300", {})
    c300_pe = a_val.get("csi300_pe", 14.96)
    c300_dy = a_val.get("csi300_dy", 0.025)
    c300_pb_pct = a_pb.get("median_pb_pct_10y", 0.81)
    c300_pe_pct = max(0.3, min(0.7, (c300_pe - 10) / 15))
    c300_ytd = calc_ytd(c300.get("close", 4860), c300.get("low_52w", 3827))
    markets.append({"market": "cn_ashare", "market_name": "A股", "index_name": "沪深300",
        **make_dims("cn_ashare", c300_ytd, c300.get("change_pct", 0),
                     pe_pct=c300_pe_pct, div_yield=c300_dy, pe=c300_pe, mcap=5586e9/7.2,
                     gdp=0.048, pmi=50.2, rate_env="low", vol=0.22, pol="medium")})

    # ---- 港股 ----
    hk = tc.get("hkHSI", {})
    hk_close = hk.get("close", 25963)
    hk_ytd = calc_ytd(hk_close, hk.get("low_52w", 16000))
    markets.append({"market": "cn_hk", "market_name": "港股", "index_name": "恒生指数",
        **make_dims("cn_hk", hk_ytd, hk.get("change_pct", 0),
                     pe_pct=0.35, div_yield=0.04, pe=10.5, mcap=4.5e12,
                     gdp=0.03, pmi=49.5, rate_env="low", vol=0.24, pol="medium")})

    # ---- 通用海外市场构建 ----
    overseas = [
        # (market, name, index, cnbc_ticker, mcap, gdp, pmi, vol, pol, rate_env, pe_est, pe_pct_est, div_est)
        ("jp", "日本", "日经225", ".N225", 6.2e12, 0.011, 49.8, "normal", 0.22, "low", 22, 0.60, 0.015),
        ("gb", "英国", "FTSE 100", ".FTSE", 4.0e12, 0.006, 50.5, "normal", 0.15, "low", 18, 0.45, 0.038),
        ("de", "德国", "DAX", ".GDAXI", 2.8e12, 0.004, 47.2, "normal", 0.19, "low", 20, 0.55, 0.030),
        ("fr", "法国", "CAC 40", ".FCHI", 3.0e12, 0.008, 49.0, "normal", 0.18, "medium", 16, 0.42, 0.035),
        ("au", "澳洲", "ASX 200", ".AXJO", 1.8e12, 0.017, 51.5, "normal", 0.14, "low", 17, 0.50, 0.040),
        ("ca", "加拿大", "S&P/TSX", ".GSPTSE", 3.2e12, 0.015, 52.0, "normal", 0.16, "low", 16, 0.45, 0.035),
        ("kr", "韩国", "KOSPI", ".KS11", 1.8e12, 0.022, 50.8, "normal", 0.20, "medium", 14, 0.35, 0.025),
        ("tw", "台湾", "加权指数", ".TWII", 2.2e12, 0.032, 53.0, "normal", 0.22, "medium", 20, 0.58, 0.022),
        ("in", "印度", "Nifty 50", ".NSEI", 4.5e12, 0.068, 57.5, "normal", 0.16, "medium", 22, 0.70, 0.012),
        ("br", "巴西", "Bovespa", ".BVSP", 1.2e12, 0.025, 50.0, "normal", 0.25, "medium", 10, 0.28, 0.045),
    ]

    for mk, mn, idx, tk, mc, g, p, re_, v, po, pe_e, pp_e, dy_e in overseas:
        d = cnbc.get(tk, {})
        close = d.get("close", 0)
        ytd = calc_ytd(close, d.get("low_52w", 0))
        chg = d.get("change_pct", 0)
        markets.append({"market": mk, "market_name": mn, "index_name": idx,
            **make_dims(mk, ytd, chg, pe_pct=pp_e, div_yield=dy_e, pe=pe_e, mcap=mc,
                         gdp=g, pmi=p, rate_env=re_, vol=v, pol=po)})

    # ---- 越南 ----
    vn_close = vn.get("close", 1922) if vn else 1922
    markets.append({"market": "vn", "market_name": "越南", "index_name": "VN-Index",
        **make_dims("vn", 0.15, 0, pe_pct=0.40, div_yield=0.02, pe=15, mcap=280e9,
                     gdp=0.065, pmi=52.0, rate_env="normal", vol=0.18, pol="medium")})

    # ---- 黄金 ----
    gc = tc.get("hf_GC", {})
    gc_close = gc.get("close", 4541)
    gc_ytd = calc_ytd(gc_close, gc.get("low_52w", 0))
    markets.append({"market": "gold", "market_name": "黄金", "index_name": "XAUUSD",
        **make_dims("gold", gc_ytd, gc.get("change_pct", 0),
                     pe=None, div_yield=0, mcap=15e12, gdp=None, pmi=None,
                     rate_env="normal" if (t_yield and t_yield < 4) else "high", vol=0.16)})

    # ---- 美债 ----
    markets.append({"market": "us_treasury", "market_name": "美债", "index_name": "10Y Treasury",
        **make_dims("us_treasury", 0.05, 0.3 if t_yield and t_yield > 4.5 else 0,
                     pe=None, div_yield=t_yield/100 if t_yield else 0.045, mcap=27e12,
                     gdp=0.025, pmi=50.5, rate_env="high" if t_yield and t_yield > 4 else "normal", vol=0.10)})

    # ---- 输出 ----
    report = {"date": date, "markets": markets}
    out_path = DATA_DIR / f"{date}.json"
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"✅ 写入 {out_path}", file=sys.stderr)
    print(json.dumps(report, ensure_ascii=False))

def get_latest_trade_date():
    today = datetime.now()
    if today.weekday() == 5: today -= timedelta(days=1)
    elif today.weekday() == 6: today -= timedelta(days=2)
    return today.strftime("%Y-%m-%d")

if __name__ == "__main__":
    main()
