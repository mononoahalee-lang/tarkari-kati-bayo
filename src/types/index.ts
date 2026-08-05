export type Locale = 'ne' | 'en' | 'ja'

export interface PriceWithChange {
  id: string
  vegetableId: string
  marketId: string
  date: string
  minPrice: number
  maxPrice: number
  avgPrice: number
  change: number | null     // absolute change from previous day
  changePct: number | null  // % change from previous day
}

export interface VegetableWithLatestPrice {
  id: string
  nameNe: string
  nameEn: string
  nameJa: string
  category: string
  unit: string
  latestPrice: PriceWithChange | null
}

export interface CandlestickPoint {
  time: string   // YYYY-MM-DD
  open: number   // previous avg
  high: number   // max
  low: number    // min
  close: number  // avg
}

export interface Dictionary {
  nav: {
    home: string
    markets: string
    news: string
    chart: string
    fieldWork: string
    compare: string
  }
  home: {
    title: string
    subtitle: string
    topGainers: string
    topLosers: string
    allVegetables: string
    searchPlaceholder: string
    updated: string
    noData: string
    vsWeekAgo: string
  }
  detail: {
    priceHistory: string
    marketComparison: string
    aiComment: string
    pricePrediction: string
    highSeason: string
    highSeasonDesc: string
    stats: {
      high52w: string
      low52w: string
      avgPrice: string
      volume: string
    }
    periods: {
      '1W': string
      '1M': string
      '3M': string
      '1Y': string
    }
  }
  news: {
    title: string
    noNews: string
  }
  price: {
    unit: string
    min: string
    max: string
    avg: string
    change: string
  }
  survey: {
    title: string
    description: string
    openForm: string
    notReady: string
  }
}
