import type { MarketId, MarketMeta } from './types';

export const markets: Record<MarketId, MarketMeta> = {
  us_sp500: { id: 'us_sp500', name: '美国', flag: '🇺🇸', indices: ['S&P 500'], dataSource: 'yfinance' },
  jp: { id: 'jp', name: '日本', flag: '🇯🇵', indices: ['日经225'], dataSource: 'yfinance' },
  gb: { id: 'gb', name: '英国', flag: '🇬🇧', indices: ['FTSE 100'], dataSource: 'yfinance' },
  de: { id: 'de', name: '德国', flag: '🇩🇪', indices: ['DAX'], dataSource: 'yfinance' },
  fr: { id: 'fr', name: '法国', flag: '🇫🇷', indices: ['CAC 40'], dataSource: 'yfinance' },
  au: { id: 'au', name: '澳洲', flag: '🇦🇺', indices: ['ASX 200'], dataSource: 'yfinance' },
  ca: { id: 'ca', name: '加拿大', flag: '🇨🇦', indices: ['S&P/TSX'], dataSource: 'yfinance' },
  cn_ashare: { id: 'cn_ashare', name: 'A股', flag: '🇨🇳', indices: ['沪深300', '中证500'], dataSource: 'AKShare' },
  cn_hk: { id: 'cn_hk', name: '港股', flag: '🇭🇰', indices: ['恒生指数', '恒生科技'], dataSource: 'AKShare' },
  kr: { id: 'kr', name: '韩国', flag: '🇰🇷', indices: ['KOSPI'], dataSource: 'yfinance' },
  tw: { id: 'tw', name: '台湾', flag: '🇹🇼', indices: ['加权指数'], dataSource: 'yfinance' },
  'in': { id: 'in', name: '印度', flag: '🇮🇳', indices: ['Nifty 50'], dataSource: 'yfinance' },
  vn: { id: 'vn', name: '越南', flag: '🇻🇳', indices: ['VN-Index'], dataSource: 'yfinance' },
  br: { id: 'br', name: '巴西', flag: '🇧🇷', indices: ['Bovespa'], dataSource: 'yfinance' },
};

export function getMarketMeta(marketId: string): MarketMeta | undefined {
  return markets[marketId as MarketId];
}

export function getAllMarketIds(): MarketId[] {
  return Object.keys(markets) as MarketId[];
}
