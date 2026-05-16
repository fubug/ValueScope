import fs from 'node:fs';
import path from 'node:path';
import type { DailyReport, MarketEntry, MarketTrend, TrendPoint, DateRange } from './types';
import { getMarketMeta } from './markets';

const DATA_DIR = path.resolve('data/daily');

function loadAllDailyReports(): DailyReport[] {
  if (!fs.existsSync(DATA_DIR)) return [];

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();

  const reports: DailyReport[] = [];

  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    const fileDate = file.replace('.json', '');

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw) as DailyReport;

      if (data.date !== fileDate) {
        console.warn(`[ValueScope] Date mismatch: file ${file} contains date ${data.date}, skipping`);
        continue;
      }

      const validMarkets = data.markets.filter((m) => {
        if (!m.market || typeof m.fish_score !== 'number') {
          console.warn(`[ValueScope] Invalid market entry in ${file}: ${JSON.stringify(m).slice(0, 100)}`);
          return false;
        }
        return true;
      });

      reports.push({ date: data.date, markets: validMarkets });
    } catch (e) {
      console.warn(`[ValueScope] Failed to parse ${file}: ${(e as Error).message}`);
    }
  }

  return reports;
}

const _cache = { reports: null as DailyReport[] | null };

function getReports(): DailyReport[] {
  if (!_cache.reports) {
    _cache.reports = loadAllDailyReports();
  }
  return _cache.reports;
}

export function getLatestReport(): DailyReport | null {
  const reports = getReports();
  return reports.length > 0 ? reports[reports.length - 1] : null;
}

export function getDateRange(): { earliest: string; latest: string; totalDays: number } | null {
  const reports = getReports();
  if (reports.length === 0) return null;
  return {
    earliest: reports[0].date,
    latest: reports[reports.length - 1].date,
    totalDays: reports.length,
  };
}

export function getSnapshotsByDate(date: string): MarketEntry[] {
  const reports = getReports();
  const report = reports.find((r) => r.date === date);
  return report?.markets ?? [];
}

function computeStartDate(latestDate: string, range: DateRange): string {
  const d = new Date(latestDate);
  switch (range) {
    case '1M':
      d.setMonth(d.getMonth() - 1);
      break;
    case '3M':
      d.setMonth(d.getMonth() - 3);
      break;
    case '6M':
      d.setMonth(d.getMonth() - 6);
      break;
    case '1Y':
      d.setFullYear(d.getFullYear() - 1);
      break;
    case 'ALL':
      return '0000-00-00';
  }
  return d.toISOString().slice(0, 10);
}

export function getMarketTrend(marketId: string, range: DateRange = 'ALL'): TrendPoint[] {
  const reports = getReports();
  if (reports.length === 0) return [];

  const startDate = computeStartDate(reports[reports.length - 1].date, range);

  return reports
    .filter((r) => r.date >= startDate)
    .map((r) => {
      const entry = r.markets.find((m) => m.market === marketId);
      return entry ? { date: r.date, fish_score: entry.fish_score } : null;
    })
    .filter((p): p is TrendPoint => p !== null);
}

export function getAllMarketTrends(range: DateRange = 'ALL'): MarketTrend[] {
  const reports = getReports();
  if (reports.length === 0) return [];

  const startDate = computeStartDate(reports[reports.length - 1].date, range);
  const filtered = reports.filter((r) => r.date >= startDate);

  const marketIds = new Set<string>();
  for (const r of filtered) {
    for (const m of r.markets) {
      marketIds.add(m.market);
    }
  }

  return Array.from(marketIds).map((id) => {
    const meta = getMarketMeta(id);
    const data: TrendPoint[] = [];
    for (const r of filtered) {
      const entry = r.markets.find((m) => m.market === id);
      if (entry) data.push({ date: r.date, fish_score: entry.fish_score });
    }
    return {
      market: id,
      market_name: meta?.name ?? id,
      flag: meta?.flag ?? '🏳️',
      data,
    };
  });
}

export function getMarketDetail(marketId: string, date?: string): MarketEntry | null {
  const reports = getReports();
  if (reports.length === 0) return null;

  const targetDate = date ?? reports[reports.length - 1].date;
  const report = reports.find((r) => r.date === targetDate);
  return report?.markets.find((m) => m.market === marketId) ?? null;
}
