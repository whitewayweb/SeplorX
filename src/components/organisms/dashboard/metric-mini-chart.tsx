"use client";

import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type { DashboardMetric } from "@/data/dashboard";

interface MetricMiniChartProps {
  chart: NonNullable<DashboardMetric["chart"]>;
  tone: DashboardMetric["tone"];
}

const CHART_COLORS = {
  chart1: "var(--chart-1)",
  chart2: "var(--chart-2)",
  chart3: "var(--chart-3)",
  chart4: "var(--chart-4)",
  chart5: "var(--chart-5)",
  border: "var(--border)",
  foreground: "var(--foreground)",
  muted: "var(--muted)",
};

function getResolvedColors() {
  if (typeof document === "undefined") return CHART_COLORS;
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;

  return {
    chart1: read("--chart-1", CHART_COLORS.chart1),
    chart2: read("--chart-2", CHART_COLORS.chart2),
    chart3: read("--chart-3", CHART_COLORS.chart3),
    chart4: read("--chart-4", CHART_COLORS.chart4),
    chart5: read("--chart-5", CHART_COLORS.chart5),
    border: read("--border", CHART_COLORS.border),
    foreground: read("--foreground", CHART_COLORS.foreground),
    muted: read("--muted", CHART_COLORS.muted),
  };
}


export function MetricMiniChart({ chart, tone }: MetricMiniChartProps) {
  if (!chart.data || chart.data.length === 0) return null;

  const colors = getResolvedColors();
  const TONE_COLORS = {
    positive: colors.chart2, // emerald-ish
    warning: colors.chart3, // amber-ish
    critical: "var(--destructive)", // red-ish
    default: colors.chart1, // blue-ish
  };

  const baseColor = TONE_COLORS[tone] || TONE_COLORS.default;

  let option: EChartsOption = {};

  const safeData = chart.data.map((v) => (Number.isFinite(v) ? v : 0));

  if (chart.type === "sparkline") {
    option = {
      animation: true,
      grid: { top: 2, bottom: 2, left: 2, right: 2 },
      xAxis: { type: "category", show: false },
      yAxis: { type: "value", show: false, min: "dataMin", max: "dataMax" },
      series: [
        {
          type: "line",
          data: safeData,
          smooth: 0.4,
          symbol: "none",
          lineStyle: { color: baseColor, width: 2 },
          areaStyle: {
            color: baseColor,
            opacity: 0.2,
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
          data: safeData,
          itemStyle: { color: baseColor, borderRadius: [2, 2, 0, 0] },
          barCategoryGap: "30%",
        },
      ],
    };
  } else if (chart.type === "gauge") {
    const value = safeData[0] || 0;
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
            { value: Math.max(0, 100 - value), itemStyle: { color: colors.muted } },
          ],
        },
      ],
    };
  } else if (chart.type === "stacked") {
    const total = safeData.reduce((acc, val) => acc + val, 0);
    const palette = [colors.chart1, colors.chart2, colors.chart3, colors.chart4, colors.chart5];

    option = {
      animation: true,
      grid: { top: "35%", bottom: "35%", left: 0, right: 0 },
      xAxis: { type: "value", show: false, max: total > 0 ? total : 1 },
      yAxis: { type: "category", show: false, data: ["1"] },
      series: safeData.map((val, idx) => ({
        type: "bar",
        stack: "total",
        data: [val],
        itemStyle: {
          color: chart.colors?.[idx] || palette[idx % palette.length],
          borderRadius: idx === safeData.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0],
        },
      })),
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
