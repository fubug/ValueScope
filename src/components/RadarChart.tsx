import { useRef, useEffect } from 'react';
import * as echarts from 'echarts';
import type { DimensionScore, DimensionKey } from '../lib/types';

interface Props {
  dimensions: Record<DimensionKey, DimensionScore>;
}

const DIM_LABELS: Record<DimensionKey, string> = {
  profit_effect: '赚钱效应',
  valuation: '估值性价比',
  scale_liquidity: '规模流动性',
  fundamentals: '经济基本面',
  institutional: '制度可进入性',
  risk_penalty: '风险惩罚',
};

export default function RadarChart({ dimensions }: Props) {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    const chart = echarts.init(chartRef.current);
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';

    const keys = Object.keys(dimensions) as DimensionKey[];
    const indicator = keys.map((k) => ({ name: DIM_LABELS[k], max: 100 }));
    const values = keys.map((k) => dimensions[k].score);

    chart.setOption({
      radar: {
        indicator,
        shape: 'polygon',
        axisName: { color: isDark ? '#aaa' : '#666', fontSize: 11 },
        splitArea: { areaStyle: { color: isDark ? ['rgba(79,140,255,0.02)', 'rgba(79,140,255,0.05)'] : ['rgba(79,140,255,0.02)', 'rgba(79,140,255,0.06)'] } },
        splitLine: { lineStyle: { color: isDark ? '#333' : '#ddd' } },
        axisLine: { lineStyle: { color: isDark ? '#333' : '#ddd' } },
      },
      series: [
        {
          type: 'radar',
          data: [
            {
              value: values,
              areaStyle: { color: 'rgba(79,140,255,0.25)' },
              lineStyle: { color: '#4f8cff', width: 2 },
              itemStyle: { color: '#4f8cff' },
            },
          ],
        },
      ],
    });

    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
    };
  }, [dimensions]);

  return <div ref={chartRef} style={{ width: '100%', height: 280 }} />;
}
