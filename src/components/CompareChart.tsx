import React, { useRef, useEffect, useState, useMemo } from 'react';
import * as echarts from 'echarts';
import type { MarketTrend, DateRange } from '../lib/types';

interface Props {
  trends: MarketTrend[];
  defaultSelected: string[];
}

const COLORS = [
  '#4f8cff', '#2ecc71', '#f39c12', '#e74c3c', '#9b59b6',
  '#1abc9c', '#e67e22', '#3498db', '#e91e63', '#00bcd4',
  '#8bc34a', '#ff5722', '#607d8b', '#795548', '#cddc39',
  '#ff9800', '#673ab7',
];

const RANGES: DateRange[] = ['1M', '3M', '6M', '1Y', 'ALL'];
const RANGE_LABELS: Record<DateRange, string> = {
  '1M': '1月', '3M': '3月', '6M': '6月', '1Y': '1年', ALL: '全部',
};

export default function CompareChart({ trends, defaultSelected }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string[]>(defaultSelected);
  const [range, setRange] = useState<DateRange>('6M');

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const overLimit = selected.length > 8;

  const filtered = useMemo(() => {
    const relevant = trends.filter((t) => selected.includes(t.market));
    if (range === 'ALL' || relevant.length === 0) return relevant;

    return relevant.map((t) => {
      const latest = t.data[t.data.length - 1]?.date ?? '';
      const d = new Date(latest);
      switch (range) {
        case '1M': d.setMonth(d.getMonth() - 1); break;
        case '3M': d.setMonth(d.getMonth() - 3); break;
        case '6M': d.setMonth(d.getMonth() - 6); break;
        case '1Y': d.setFullYear(d.getFullYear() - 1); break;
      }
      const start = d.toISOString().slice(0, 10);
      return { ...t, data: t.data.filter((p) => p.date >= start) };
    });
  }, [trends, selected, range]);

  useEffect(() => {
    if (!chartRef.current) return;

    const chart = echarts.init(chartRef.current);
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';

    const allDates = new Set<string>();
    filtered.forEach((t) => t.data.forEach((p) => allDates.add(p.date)));
    const dates = Array.from(allDates).sort();

    const series = filtered.map((t, i) => {
      const dateMap = new Map(t.data.map((p) => [p.date, p.fish_score]));
      return {
        name: `${t.flag} ${t.market_name}`,
        type: 'line' as const,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2 },
        data: dates.map((d) => dateMap.get(d) ?? null),
        connectNulls: true,
      };
    });

    chart.setOption({
      color: COLORS,
      grid: { top: 40, right: 20, bottom: 30, left: 40 },
      legend: {
        top: 0,
        textStyle: { color: isDark ? '#aaa' : '#666', fontSize: 11 },
        type: 'scroll',
      },
      xAxis: {
        type: 'category',
        data: dates.map((d) => d.slice(5)),
        axisLine: { lineStyle: { color: isDark ? '#333' : '#ccc' } },
        axisLabel: { color: isDark ? '#888' : '#999', fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        splitLine: { lineStyle: { color: isDark ? '#222' : '#eee' } },
        axisLabel: { color: isDark ? '#888' : '#999', fontSize: 11 },
      },
      series,
      tooltip: {
        trigger: 'axis',
        backgroundColor: isDark ? '#1a1d27' : '#fff',
        borderColor: isDark ? '#333' : '#eee',
        textStyle: { color: isDark ? '#e4e6eb' : '#333' },
      },
    });

    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
    };
  }, [filtered]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            style={{
              padding: '4px 10px',
              fontSize: 12,
              border: `1px solid ${r === range ? '#4f8cff' : 'var(--border)'}`,
              borderRadius: 6,
              background: r === range ? 'rgba(79,140,255,0.15)' : 'transparent',
              color: r === range ? '#4f8cff' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {RANGE_LABELS[r]}
          </button>
        ))}
      </div>

      {overLimit && (
        <div style={{ color: '#f39c12', fontSize: 12, marginBottom: 8 }}>
          已选择 {selected.length} 个市场，超过8个可能影响可读性
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {trends.map((t, i) => (
          <label
            key={t.market}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 8px',
              borderRadius: 6,
              border: `1px solid ${selected.includes(t.market) ? COLORS[i % COLORS.length] : 'var(--border)'}`,
              background: selected.includes(t.market) ? `${COLORS[i % COLORS.length]}22` : 'transparent',
              cursor: 'pointer',
              fontSize: 12,
              color: selected.includes(t.market) ? COLORS[i % COLORS.length] : 'var(--text-secondary)',
            }}
          >
            <input
              type="checkbox"
              checked={selected.includes(t.market)}
              onChange={() => toggle(t.market)}
              style={{ display: 'none' }}
            />
            {t.flag} {t.market_name}
          </label>
        ))}
      </div>

      <div ref={chartRef} style={{ width: '100%', height: 400 }} />
    </div>
  );
}
