'use client'

import { useEffect, useRef } from 'react'
import { createChart, AreaSeries, LineSeries, type IChartApi } from 'lightweight-charts'
import type { CandlestickPoint } from '@/types'

interface Props {
  data: CandlestickPoint[]
  height?: number
  className?: string
}

export default function PriceChart({ data, height = 320, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const h = height ?? containerRef.current.clientHeight

    const chart = createChart(containerRef.current, {
      height: h,
      layout: {
        background: { color: '#18181b' },
        textColor: '#a1a1aa',
      },
      grid: {
        vertLines: { color: '#27272a' },
        horzLines: { color: '#27272a' },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#3f3f46' },
      timeScale: { borderColor: '#3f3f46', timeVisible: true },
    })
    chartRef.current = chart

    // Area series for the avg price with filled background
    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: '#22c55e',
      topColor: 'rgba(34, 197, 94, 0.25)',
      bottomColor: 'rgba(34, 197, 94, 0.02)',
      lineWidth: 2,
    })

    // High price line (subtle)
    const highSeries = chart.addSeries(LineSeries, {
      color: 'rgba(34, 197, 94, 0.35)',
      lineWidth: 1,
      lineStyle: 2, // dashed
      lastValueVisible: false,
      priceLineVisible: false,
    })

    // Low price line (subtle)
    const lowSeries = chart.addSeries(LineSeries, {
      color: 'rgba(239, 68, 68, 0.35)',
      lineWidth: 1,
      lineStyle: 2, // dashed
      lastValueVisible: false,
      priceLineVisible: false,
    })

    if (data.length > 0) {
      areaSeries.setData(data.map((d) => ({ time: d.time, value: d.close })))
      highSeries.setData(data.map((d) => ({ time: d.time, value: d.high })))
      lowSeries.setData(data.map((d) => ({ time: d.time, value: d.low })))
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

  return <div ref={containerRef} className={`w-full rounded-lg overflow-hidden ${className ?? ''}`} style={height !== undefined ? { height } : { height: '100%' }} />
}
