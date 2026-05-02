"use client";

import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type { DashboardMetric } from "@/data/dashboard";

interface MetricMiniChartProps {
  chart: NonNullable<DashboardMetric["chart"]>;
  tone: DashboardMetric["tone"];
}

const TONE_COLORS = {
  positive: "#10b981", // emerald-500
  warning: "#f59e0b", // amber-500
  critical: "#ef4444", // red-500
  default: "#3b82f6", // blue-500
};

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function MetricMiniChart({ chart, tone }: MetricMiniChartProps) {
  if (!chart.data || chart.data.length === 0) return null;

  const baseColor = TONE_COLORS[tone] || TONE_COLORS.default;

  let option: EChartsOption = {};

  if (chart.type === "sparkline") {
    option = {
      animation: true,
      grid: { top: 2, bottom: 2, left: 2, right: 2 },
      xAxis: { type: "category", show: false },
      yAxis: { type: "value", show: false, min: "dataMin", max: "dataMax" },
      series: [
        {
          type: "line",
          data: chart.data,
          smooth: 0.4,
          symbol: "none",
          lineStyle: { color: baseColor, width: 2 },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: hexToRgba(baseColor, 0.4) },
                { offset: 1, color: hexToRgba(baseColor, 0) },
              ],
            },
          },
        },
      ],
    };
  } else if (chart.type === "bar") {
    option = {
      animation: true,
      grid: { top: 2, bottom: 2, left: 2, right: 2 },
      xAxis: { type: "category", show: false },
      yAxis: { type: "value", show: false },
      series: [
        {
          type: "bar",
          data: chart.data,
          itemStyle: { color: baseColor, borderRadius: [2, 2, 0, 0] },
          barCategoryGap: "30%",
        },
      ],
    };
  } else if (chart.type === "gauge") {
    const value = chart.data[0] || 0;
    option = {
      animation: true,
      series: [
        {
          type: "pie",
          radius: ["65%", "100%"],
          center: ["50%", "50%"],
          startAngle: 90,
          label: { show: false },
          itemStyle: { borderWidth: 0 },
          data: [
            { value: value, itemStyle: { color: baseColor } },
            { value: 100 - value, itemStyle: { color: "#e2e8f0" } }, // slate-200
          ],
        },
      ],
    };
  } else if (chart.type === "stacked") {
    // Determine the max so the bar stretches correctly
    const total = chart.data.reduce((acc, val) => acc + val, 0);
    option = {
      animation: true,
      grid: { top: "35%", bottom: "35%", left: 0, right: 0 },
      xAxis: { type: "value", show: false, max: total > 0 ? total : 1 },
      yAxis: { type: "category", show: false, data: ["1"] },
      series: [
        {
          type: "bar",
          stack: "total",
          data: [chart.data[0]],
          itemStyle: { color: TONE_COLORS.critical },
        },
        {
          type: "bar",
          stack: "total",
          data: [chart.data[1]],
          itemStyle: { color: TONE_COLORS.warning },
        },
        {
          type: "bar",
          stack: "total",
          data: [chart.data[2]],
          itemStyle: { color: TONE_COLORS.default, borderRadius: [0, 4, 4, 0] },
        },
      ],
    };
  }

  return (
    <div className="h-full w-full">
      <ReactECharts
        option={option}
        notMerge
        lazyUpdate
        style={{ height: "100%", width: "100%" }}
        opts={{ renderer: "svg" }} // SVG renderer usually looks crisper for tiny charts!
      />
    </div>
  );
}
