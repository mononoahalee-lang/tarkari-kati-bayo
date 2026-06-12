'use client'

import { useEffect, useRef } from 'react'
import { createChart, CandlestickSeries, type IChartApi } from 'lightweight-charts'
import type { CandlestickPoint } from '@/types'

interface Props {
  data: CandlestickPoint[]
  height?: number
}

export default function PriceChart({ data, height = 320 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { color: '#18181b' },
        textColor: '#a1a1aa',
      },
      grid: {
        vertLines: { color: '#27272a' },
        horzLines: { color: '#27272a' },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: '#3f3f46',
      },
      timeScale: {
        borderColor: '#3f3f46',
        timeVisible: true,
      },
    })
    chartRef.current = chart

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    })

    if (data.length > 0) {
      candleSeries.setData(data as Parameters<typeof candleSeries.setData>[0])
      chart.timeScale().fitContent()
    }

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth })
      }
    }
    window.addEventListener('resize', handleResize)
    chart.applyOptions({ width: containerRef.current.clientWidth })

    return () => {
      window.removeEventListener('resize', handleResize)
      chart.remove()
      chartRef.current = null
    }
  }, [data, height])

  return <div ref={containerRef} className="w-full rounded-lg overflow-hidden" style={{ height }} />
}
