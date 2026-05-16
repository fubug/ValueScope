import React, { useRef, useEffect, useState, useMemo } from 'react';
import * as echarts from 'echarts';
import type { TrendPoint, DateRange } from '../lib/types';

interface Props {
  data: TrendPoint[];
}

const RANGES: DateRange[] = ['1M', '3M', '6M', '1Y', 'ALL'];
const RANGE_LABELS: Record<DateRange, string> = {
  '1M': '1月', '3M': '3月', '6M': '6月', '1Y': '1年', ALL: '全部',
};

export default function TrendChart({ data }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [range, setRange] = useState<DateRange>('ALL');

  const filtered = useMemo(() => {
    if (range === 'ALL' || data.length === 0) return data;
    const latest = data[data.length - 1].date;
    const d = new Date(latest);
    switch (range) {
      case '1M': d.setMonth(d.getMonth() - 1); break;
      case '3M': d.setMonth(d.getMonth() - 3); break;
      case '6M': d.setMonth(d.getMonth() - 6); break;
      case '1Y': d.setFullYear(d.getFullYear() - 1); break;
    }
    const start = d.toISOString().slice(0, 10);
    return data.filter((p) => p.date >= start);
  }, [data, range]);

  useEffect(() => {
    if (!chartRef.current) return;

    const chart = echarts.init(chartRef.current);
    chartInstance.current = chart;

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';

    chart.setOption({
      grid: { top: 20, right: 20, bottom: 30, left: 40 },
      xAxis: {
        type: 'category',
        data: filtered.map((p) => p.date.slice(5)),
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
      series: [{
        type: 'line',
        data: filtered.map((p) => p.fish_score),
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#4f8cff', width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(79,140,255,0.3)' },
            { offset: 1, color: 'rgba(79,140,255,0.02)' },
          ]),
        },
      }],
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
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
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
      <div ref={chartRef} style={{ width: '100%', height: 260 }} />
    </div>
  );
}
