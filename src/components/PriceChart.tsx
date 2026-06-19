'use client'

import { useEffect, useRef } from 'react'
import { createChart, AreaSeries, LineSeries, type IChartApi, type UTCTimestamp } from 'lightweight-charts'
import type { CandlestickPoint } from '@/types'

interface Props {
  data: CandlestickPoint[]
  visibleDays?: number
  height?: number
  className?: string
}

function applyVisibleRange(chart: IChartApi, data: CandlestickPoint[], visibleDays?: number) {
  if (data.length === 0) return
  if (!visibleDays) {
    chart.timeScale().fitContent()
    return
  }
  // Use today as the end so period buttons always show the most recent N days.
  // If the visible range contains no data, fall back to showing all available data.
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - visibleDays)
  const endStr = end.toISOString().split('T')[0]
  const startStr = start.toISOString().split('T')[0]
  const hasDataInRange = data.some(
    (d) => (d.time as string) >= startStr && (d.time as string) <= endStr
  )
  if (!hasDataInRange) {
    chart.timeScale().fitContent()
    return
  }
  chart.timeScale().setVisibleRange({
    from: (start.getTime() / 1000) as UTCTimestamp,
    to: (end.getTime() / 1000) as UTCTimestamp,
  })
}

export default function PriceChart({ data, visibleDays, height = 320, className }: Props) {
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

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: '#22c55e',
      topColor: 'rgba(34, 197, 94, 0.25)',
      bottomColor: 'rgba(34, 197, 94, 0.02)',
      lineWidth: 2,
    })

    const highSeries = chart.addSeries(LineSeries, {
      color: 'rgba(34, 197, 94, 0.35)',
      lineWidth: 1,
      lineStyle: 2,
      lastValueVisible: false,
      priceLineVisible: false,
    })

    const lowSeries = chart.addSeries(LineSeries, {
      color: 'rgba(239, 68, 68, 0.35)',
      lineWidth: 1,
      lineStyle: 2,
      lastValueVisible: false,
      priceLineVisible: false,
    })

    if (data.length > 0) {
      areaSeries.setData(data.map((d) => ({ time: d.time, value: d.close })))
      highSeries.setData(data.map((d) => ({ time: d.time, value: d.high })))
      lowSeries.setData(data.map((d) => ({ time: d.time, value: d.low })))
      applyVisibleRange(chart, data, visibleDays)
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
  }, [data, height]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update visible range when period changes without recreating the chart
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    applyVisibleRange(chart, data, visibleDays)
  }, [visibleDays, data])

  return <div ref={containerRef} className={`w-full rounded-lg overflow-hidden ${className ?? ''}`} style={height !== undefined ? { height } : { height: '100%' }} />
}
