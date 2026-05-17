import { useRef, useEffect } from 'react';
import * as echarts from 'echarts';
import type { DimensionScore, DimensionKey } from '../lib/types';

interface Props {
  dimensions: Record<DimensionKey, DimensionScore>;
}

const DIM_LABELS: Record<DimensionKey, string> = {
  info_aggregation: '信息聚合',
  transaction_cost: '交易成本',
  incentive_alignment: '激励对齐',
  risk_dispersion: '风险分散',
  property_rights: '产权执行',
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
