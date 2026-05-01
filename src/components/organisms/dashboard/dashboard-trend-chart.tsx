"use client";

import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type { DashboardTrendPoint } from "@/data/dashboard";
import { formatCurrency } from "@/lib/utils";

interface DashboardTrendChartProps {
  points: DashboardTrendPoint[];
}

interface TooltipParam {
  dataIndex?: number;
  marker?: string;
  seriesName?: string;
  value?: number | string;
}

function isTooltipParam(value: unknown): value is TooltipParam {
  return typeof value === "object" && value !== null;
}

function getTooltipParams(params: unknown): TooltipParam[] {
  if (!Array.isArray(params)) return [];
  return params.filter(isTooltipParam);
}

export function DashboardTrendChart({ points }: DashboardTrendChartProps) {
  const visiblePoints = points.length > 0
    ? points
    : [{ id: "empty", label: "No sales", date: "", revenue: 0, profit: 0, missingCostRevenue: 0, orders: 0 }];

  const option: EChartsOption = {
    animationDuration: 220,
    color: ["#2563eb", "#10b981"],
    grid: {
      top: 20,
      right: 18,
      bottom: 34,
      left: 76,
    },
    tooltip: {
      trigger: "axis",
      axisPointer: {
        type: "shadow",
      },
      borderColor: "#e5e7eb",
      borderWidth: 1,
      padding: 12,
      textStyle: {
        color: "#020617",
        fontFamily: "inherit",
      },
      formatter: (params: unknown) => {
        const tooltipParams = getTooltipParams(params);
        const point = visiblePoints[tooltipParams[0]?.dataIndex ?? 0];
        if (!point) return "";

        const missingCost = point.missingCostRevenue > 0
          ? `<div style="margin-top:4px;color:#92400e">${formatCurrency(point.missingCostRevenue)} missing product cost</div>`
          : "";
        const rows = tooltipParams.map((item) => {
          const value = typeof item.value === "number" ? item.value : Number(item.value ?? 0);
          return `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:6px">
              <span>${item.marker ?? ""}${item.seriesName ?? ""}</span>
              <strong style="font-family:monospace">${formatCurrency(value)}</strong>
            </div>
          `;
        }).join("");

        return `
          <div>
            <div style="font-weight:600;margin-bottom:6px">${point.label} · ${point.orders} orders</div>
            ${rows}
            ${missingCost}
          </div>
        `;
      },
    },
    xAxis: {
      type: "category",
      data: visiblePoints.map((point) => point.label),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#e5e7eb" } },
      axisLabel: {
        color: "#64748b",
        fontFamily: "inherit",
        hideOverlap: true,
      },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        color: "#64748b",
        fontFamily: "inherit",
        formatter: (value: number) => formatCurrency(value).replace("INR ", ""),
      },
      splitLine: {
        lineStyle: {
          color: "#e5e7eb",
        },
      },
    },
    series: [
      {
        name: "Revenue",
        type: "bar",
        data: visiblePoints.map((point) => point.revenue),
        barGap: "12%",
        barMaxWidth: 42,
        itemStyle: {
          borderRadius: [5, 5, 0, 0],
        },
      },
      {
        name: "Known-cost profit",
        type: "bar",
        data: visiblePoints.map((point) => point.profit),
        barMaxWidth: 42,
        itemStyle: {
          borderRadius: [5, 5, 0, 0],
        },
      },
    ],
  };

  return (
    <ReactECharts
      option={option}
      notMerge
      lazyUpdate
      style={{ height: 288, width: "100%" }}
      opts={{ renderer: "canvas" }}
    />
  );
}
