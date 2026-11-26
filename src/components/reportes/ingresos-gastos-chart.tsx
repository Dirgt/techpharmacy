'use client'

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'

function formatCompactCop(value: number): string {
  const num = Number(value || 0)
  if (num >= 1_000_000) {
    const millions = num / 1_000_000
    return `$${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M`
  }
  if (num >= 1_000) {
    return `$${Math.round(num / 1_000)}k`
  }
  return `$${Math.round(num)}`
}

function formatShortDateLabel(isoDate: string): string {
  const parts = String(isoDate || '').split('-')
  if (parts.length === 3) {
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
    const day = Number(parts[2])
    const monthIdx = Number(parts[1]) - 1
    return `${day} ${months[monthIdx] || parts[1]}`
  }
  return isoDate
}

export function IngresosGastosChart({
  data,
  mode = 'area',
  height = 290,
}: {
  data: { fecha: string; ingresos: number; gastos: number }[]
  mode?: 'area' | 'bar'
  height?: number
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {mode === 'bar' ? (
          <BarChart data={data} margin={{ top: 10, right: 8, left: -12, bottom: 0 }} barGap={6}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis
              dataKey="fecha"
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
              tickFormatter={formatShortDateLabel}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
              tickFormatter={formatCompactCop}
            />
            <Tooltip
              cursor={{ fill: '#f1f5f9' }}
              contentStyle={{
                borderRadius: '14px',
                border: '1px solid #e2e8f0',
                backgroundColor: '#0f172a',
                color: '#f8fafc',
                boxShadow: '0 20px 25px -5px rgb(15 23 42 / 0.25)',
                padding: '10px 14px',
              }}
              itemStyle={{ fontSize: '12px', fontWeight: 700 }}
              labelStyle={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, marginBottom: 4 }}
              labelFormatter={(label) => `Jornada: ${formatShortDateLabel(String(label))}`}
              formatter={(value, name) => [
                formatCurrency(Number(value ?? 0)),
                name === 'Ingresos' ? 'Ventas' : 'Compras / Gastos',
              ]}
            />
            <Bar
              name="Ingresos"
              dataKey="ingresos"
              fill="#10b981"
              radius={[6, 6, 0, 0]}
              maxBarSize={28}
            />
            <Bar
              name="Gastos"
              dataKey="gastos"
              fill="#f43f5e"
              radius={[6, 6, 0, 0]}
              maxBarSize={28}
            />
          </BarChart>
        ) : (
          <AreaChart data={data} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="colorIngresos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.32} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.01} />
              </linearGradient>
              <linearGradient id="colorGastos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.24} />
                <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis
              dataKey="fecha"
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
              tickFormatter={formatShortDateLabel}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }}
              tickFormatter={formatCompactCop}
            />
            <Tooltip
              contentStyle={{
                borderRadius: '14px',
                border: '1px solid #1e293b',
                backgroundColor: '#0f172a',
                color: '#f8fafc',
                boxShadow: '0 20px 25px -5px rgb(15 23 42 / 0.25)',
                padding: '10px 14px',
              }}
              itemStyle={{ fontSize: '12px', fontWeight: 700 }}
              labelStyle={{ color: '#94a3b8', fontSize: '11px', fontWeight: 700, marginBottom: 4 }}
              labelFormatter={(label) => `Jornada: ${formatShortDateLabel(String(label))}`}
              formatter={(value, name) => [
                formatCurrency(Number(value ?? 0)),
                name === 'Ingresos' ? 'Ventas' : 'Compras / Gastos',
              ]}
            />
            <Area
              type="monotone"
              name="Ingresos"
              dataKey="ingresos"
              stroke="#10b981"
              strokeWidth={3}
              activeDot={{ r: 5, strokeWidth: 2, stroke: '#ffffff', fill: '#10b981' }}
              fillOpacity={1}
              fill="url(#colorIngresos)"
            />
            <Area
              type="monotone"
              name="Gastos"
              dataKey="gastos"
              stroke="#f43f5e"
              strokeWidth={2.5}
              activeDot={{ r: 4, strokeWidth: 2, stroke: '#ffffff', fill: '#f43f5e' }}
              fillOpacity={1}
              fill="url(#colorGastos)"
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
