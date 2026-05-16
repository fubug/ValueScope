import type { MarketEntry } from '../lib/types';
import { getMarketMeta } from '../lib/markets';

interface Props {
  markets: MarketEntry[];
}

export default function FishRanking({ markets }: Props) {
  const ranked = markets.map((m, i) => {
    const meta = getMarketMeta(m.market);
    return { ...m, meta, rank: i + 1 };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {ranked.map((m) => {
        const isTop3 = m.rank <= 3;
        const borderColor = m.rank === 1 ? 'var(--gold)' : m.rank === 2 ? 'var(--silver)' : m.rank === 3 ? 'var(--bronze)' : 'var(--border)';
        const bg = m.rank === 1 ? 'rgba(240,185,11,0.08)' : m.rank === 2 ? 'rgba(192,192,192,0.06)' : m.rank === 3 ? 'rgba(205,127,50,0.06)' : 'var(--bg-card)';

        return (
          <a
            key={m.market}
            href={`/ValueScope/market/${m.market}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '12px 16px',
              borderRadius: 'var(--radius)',
              border: `1px solid ${borderColor}`,
              background: bg,
              textDecoration: 'none',
              color: 'var(--text)',
              transition: 'background 0.2s',
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 700, width: 28, textAlign: 'center', color: isTop3 ? borderColor : 'var(--text-secondary)' }}>
              {m.rank}
            </div>
            <div style={{ fontSize: 24 }}>{m.meta?.flag ?? '🏳️'}</div>
            <div style={{ flex: '0 0 100px' }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>
                {m.meta?.name ?? m.market_name}
                {isTop3 && <span style={{ marginLeft: 6 }}>{m.rank === 1 ? '🥇' : m.rank === 2 ? '🥈' : '🥉'}</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m.index_name}</div>
            </div>
            <div style={{ flex: 1, background: 'var(--border)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
              <div style={{ width: `${m.fish_score}%`, height: '100%', borderRadius: 4, background: isTop3 ? borderColor : 'var(--accent)' }} />
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, width: 50, textAlign: 'right', color: isTop3 ? borderColor : 'var(--accent)' }}>
              {m.fish_score}
            </div>
          </a>
        );
      })}
    </div>
  );
}
