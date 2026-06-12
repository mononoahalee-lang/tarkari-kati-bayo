'use client'

import dynamic from 'next/dynamic'
import type { CandlestickPoint } from '@/types'

const PriceChart = dynamic(() => import('./PriceChart'), { ssr: false })

interface Props {
  data: CandlestickPoint[]
  height?: number
}

export default function PriceChartWrapper({ data, height }: Props) {
  return <PriceChart data={data} height={height} />
}
