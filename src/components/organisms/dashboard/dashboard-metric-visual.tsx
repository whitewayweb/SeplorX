"use client";

import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import type { DashboardMetric } from "@/data/dashboard";

export type MetricVisualType = "line" | "bars" | "comparison" | "inventory" | "health" | "queue";

interface DashboardMetricVisualProps {
  values: number[];
  tone: DashboardMetric["tone"];
  type: MetricVisualType;
  valueText: string;
}

function getToneColor(tone: DashboardMetric["tone"]): string {
  if (tone === "critical") return "#ef4444";
  if (tone === "warning") return "#f59e0b";
  return "#0d9488";
}

function getHealthPercent(valueText: string): number {
  const [healthy, total] = valueText.split("/").map((value) => Number(value));
  if (!total || !Number.isFinite(healthy) || !Number.isFinite(total)) return 0;
  return Math.max(0, Math.min(100, (healthy / total) * 100));
}

function getOption({
  values,
  tone,
  type,
  valueText,
}: DashboardMetricVisualProps): EChartsOption {
  const color = getToneColor(tone);
  const visibleValues = values.length > 0 ? values.slice(-8) : [0];
  const maxValue = Math.max(...visibleValues, 1);

  if (type === "line") {
    return {
      animationDuration: 180,
      grid: { left: 0, right: 0, top: 4, bottom: 4 },
      xAxis: { type: "category", show: false, data: visibleValues.map((_, index) => index) },
      yAxis: { type: "value", show: false, min: 0, max: maxValue },
      series: [{
        type: "line",
        data: visibleValues,
        showSymbol: false,
        smooth: true,
        lineStyle: { width: 4, color },
        areaStyle: { color: `${color}22` },
      }],
    };
  }

  if (type === "comparison") {
    return {
      animationDuration: 180,
      grid: { left: 0, right: 0, top: 4, bottom: 4 },
      xAxis: { type: "value", show: false, min: 0, max: maxValue },
      yAxis: { type: "category", show: false, data: visibleValues.slice(-4).map((_, index) => index) },
      series: [{
        type: "bar",
        data: visibleValues.slice(-4),
        barWidth: 8,
        itemStyle: { color, borderRadius: 8 },
      }],
    };
  }

  if (type === "health") {
    return {
      animationDuration: 180,
      series: [{
        type: "gauge",
        startAngle: 180,
        endAngle: 0,
        radius: "120%",
        center: ["50%", "82%"],
        min: 0,
        max: 100,
        progress: { show: true, width: 8, itemStyle: { color } },
        axisLine: { lineStyle: { width: 8, color: [[1, "#e5e7eb"]] } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        pointer: { show: false },
        detail: { show: false },
        data: [{ value: getHealthPercent(valueText) }],
      }],
    };
  }

  if (type === "queue") {
    return {
      animationDuration: 180,
      grid: { left: 0, right: 0, top: 12, bottom: 8 },
      xAxis: { type: "category", show: false, data: ["urgent", "sync", "stock", "returns"] },
      yAxis: { type: "value", show: false, min: 0, max: 1 },
      series: [{
        type: "bar",
        data: [1, 0.25, 0.25, 0.25],
        barWidth: 28,
        itemStyle: {
          borderRadius: 4,
          color: (params: { dataIndex: number }) => params.dataIndex === 0 ? color : "#e5e7eb",
        },
      }],
    };
  }

  if (type === "inventory") {
    return {
      animationDuration: 180,
      grid: { left: 0, right: 0, top: 12, bottom: 10 },
      xAxis: { type: "category", show: false, data: ["cash", "reserved", "slow", "risk", "free"] },
      yAxis: { type: "value", show: false, min: 0, max: 1 },
      series: [{
        type: "bar",
        data: [0.65, 0.42, 0.9, 0.36, 0.74],
        barWidth: 14,
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          color: (params: { dataIndex: number }) => params.dataIndex === 2 && tone === "warning" ? color : "#94a3b8",
        },
      }],
    };
  }

  return {
    animationDuration: 180,
    grid: { left: 0, right: 0, top: 4, bottom: 4 },
    xAxis: { type: "category", show: false, data: visibleValues.map((_, index) => index) },
    yAxis: { type: "value", show: false, min: 0, max: maxValue },
    series: [{
      type: "bar",
      data: visibleValues,
      barWidth: 22,
      itemStyle: { color, borderRadius: [5, 5, 0, 0] },
    }],
  };
}

export function DashboardMetricVisual(props: DashboardMetricVisualProps) {
  return (
    <ReactECharts
      option={getOption(props)}
      notMerge
      lazyUpdate
      style={{ height: 52, width: "100%", marginTop: 16 }}
      opts={{ renderer: "canvas" }}
    />
  );
}
