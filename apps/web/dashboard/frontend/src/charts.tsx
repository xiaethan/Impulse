import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import Highcharts from "highcharts";
import "highcharts/highcharts-more";
import HighchartsReactModule from "highcharts-react-official";
import { formatNumber, type Athlete } from "./data";

const HighchartsReact: ComponentType<{
  highcharts: typeof Highcharts;
  options: Highcharts.Options;
  callback?: (chart: Highcharts.Chart) => void;
}> =
  typeof HighchartsReactModule === "function"
    ? HighchartsReactModule
    : (
        HighchartsReactModule as unknown as {
          HighchartsReact: ComponentType<{
            highcharts: typeof Highcharts;
            options: Highcharts.Options;
            callback?: (chart: Highcharts.Chart) => void;
          }>;
        }
      ).HighchartsReact;

const font = "Barlow, Segoe UI, sans-serif";
const muted = "#7b8798";
const line = "#e6edf5";
const ink = "#1c2434";
const blue = "#2f6bff";

const labelStyle = { color: muted, fontSize: "11px", fontFamily: font };

function forceShape(peak: number, shift = 0): Array<[number, number]> {
  const shape = [0, 0.06, 0.24, 0.58, 0.88, 1, 0.94, 0.8, 0.68, 0.58, 0.54, 0.52, 0.53, 0.57, 0.62, 0.67, 0.72];
  const samples = Array.from({ length: 51 }, (_, index) => {
    const t = Math.min(1, Math.max(0, index / 50 + shift));
    const x = t * (shape.length - 1);
    const low = Math.floor(x);
    const high = Math.min(shape.length - 1, low + 1);
    const blend = shape[low] * (1 - (x - low)) + shape[high] * (x - low);
    return [index * 2, Math.max(0, blend)] as [number, number];
  });
  const max = Math.max(...samples.map((point) => point[1]));
  return samples.map(([x, y]) => [x, max === 0 ? 0 : Math.round((y / max) * peak)]);
}

function strokeWave(scale: number, phase = 0): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (let step = 0; step <= 160; step += 1) {
    const stroke = 1 + (step / 160) * 9;
    const local = (step % 16) / 16;
    const hump = Math.sin(local * Math.PI) ** 1.05;
    const drift = 0.86 + 0.14 * Math.sin(stroke * 1.4 + phase);
    points.push([Math.round(stroke * 100) / 100, Math.round(scale * hump * drift)]);
  }
  return points;
}

function baseChart(height: number, spacingTop = 10): Highcharts.ChartOptions {
  return {
    backgroundColor: "transparent",
    height,
    animation: false,
    style: { fontFamily: font },
    spacing: [spacingTop, 6, 2, 4],
  };
}

function axes(yTitle: string, yMax: number, xTitle: string): Pick<Highcharts.Options, "xAxis" | "yAxis"> {
  return {
    xAxis: {
      title: { text: xTitle, style: labelStyle },
      lineColor: line,
      tickColor: line,
      labels: { style: labelStyle },
    },
    yAxis: {
      title: { text: yTitle, style: labelStyle },
      min: 0,
      max: yMax,
      gridLineColor: line,
      labels: {
        style: labelStyle,
        formatter() {
          return formatNumber(Number(this.value));
        },
      },
    },
  };
}

const sharedPlot: Highcharts.PlotOptions = {
  series: {
    animation: false,
    marker: { enabled: false, symbol: "circle", radius: 3, states: { hover: { enabled: true } } },
    states: { inactive: { opacity: 1 }, hover: { lineWidthPlus: 0 } },
  },
};

function tooltip(): Highcharts.TooltipOptions {
  return {
    shared: true,
    backgroundColor: "#ffffff",
    borderColor: line,
    borderRadius: 8,
    shadow: false,
    style: { color: ink, fontSize: "12px", fontFamily: font },
  };
}

export type SensorSample = [number, number, number, number];

const CATCH_ANGLE = -56;
const FINISH_ANGLE = 42;

function strokePosition(angle: number) {
  return Math.min(100, Math.max(0, ((angle - CATCH_ANGLE) / (FINISH_ANGLE - CATCH_ANGLE)) * 100));
}

function binDrive(samples: SensorSample[], channel: "force" | "footboard"): Array<[number, number]> {
  const bins = Array.from({ length: 21 }, () => ({ sum: 0, count: 0 }));
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const sample = samples[index];
    if (sample[0] - previous[0] > 0.4) {
      continue;
    }
    if (sample[2] - previous[2] <= 0.4) {
      continue;
    }
    const bin = Math.min(20, Math.round(strokePosition(sample[2]) / 5));
    bins[bin].sum += channel === "footboard" ? sample[3] : sample[1];
    bins[bin].count += 1;
  }
  const points = bins.flatMap((bin, index) => (bin.count === 0 ? [] : [[index * 5, Math.round(bin.sum / bin.count)] as [number, number]]));
  return points.length === 0 ? [[0, 0], [100, 0]] : points;
}

function drivesIn(samples: SensorSample[]) {
  const drives: SensorSample[][] = [];
  let current: SensorSample[] = [];
  const close = () => {
    if (current.length > 1) {
      drives.push(current);
    }
    current = [];
  };
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const sample = samples[index];
    if (sample[0] - previous[0] > 0.4) {
      close();
      continue;
    }
    if (sample[2] - previous[2] > 0.4) {
      if (current.length === 0) {
        current.push(previous);
      }
      current.push(sample);
    } else {
      close();
    }
  }
  close();
  return drives;
}

function drivePeak(drive: SensorSample[], channel: "force" | "footboard") {
  return drive.reduce((peak, sample) => Math.max(peak, channel === "footboard" ? sample[3] : sample[1]), 0);
}

export function selectionCurve(samples: SensorSample[], start: number, end: number, channel: "force" | "footboard") {
  if (start !== end) {
    return binDrive(samples.filter((sample) => sample[0] >= start && sample[0] < end + 1), channel);
  }
  const nearby = samples.filter((sample) => sample[0] >= start - 1.5 && sample[0] <= start + 1.5);
  const drives = drivesIn(nearby);
  const overlapping = drives.filter((drive) => drive[drive.length - 1][0] >= start && drive[0][0] < start + 1);
  const chosen = overlapping.reduce<SensorSample[] | undefined>((best, drive) => {
    if (!best || drivePeak(drive, channel) > drivePeak(best, channel)) {
      return drive;
    }
    return best;
  }, undefined);
  return binDrive(chosen ?? [], channel);
}

export function sessionCurve(samples: SensorSample[], channel: "force" | "footboard") {
  return binDrive(samples, channel);
}

export function seriesPeak(points: Array<[number, number]>) {
  return points.reduce((peak, point) => Math.max(peak, point[1]), 0);
}

export function ForceCurveChart({
  current,
  average,
  yMax = 2000,
  height = 228,
}: {
  current: Array<[number, number]>;
  average: Array<[number, number]>;
  yMax?: number;
  height?: number;
}) {
  const options = useMemo<Highcharts.Options>(() => {
    const peakAt = current.reduce((best, point) => (point[1] > best[1] ? point : best), current[0] ?? [0, 0]);

    return {
      chart: baseChart(height, 28),
      title: { text: undefined },
      credits: { enabled: false },
      legend: { enabled: false },
      tooltip: tooltip(),
      ...axes("Force (N)", yMax, "Stroke Position (%)"),
      xAxis: {
        ...axes("Force (N)", yMax, "Stroke Position (%)").xAxis,
        min: 0,
        max: 100,
        tickInterval: 20,
        plotLines: [
          {
            value: peakAt[0],
            color: "#c5d0de",
            dashStyle: "Dash",
            width: 1,
            zIndex: 4,
          },
        ],
      },
      yAxis: {
        ...axes("Force (N)", yMax, "Stroke Position (%)").yAxis,
        tickInterval: yMax > 800 ? 500 : 200,
      },
      plotOptions: sharedPlot,
      series: [
        {
          type: "line",
          name: "Session average",
          data: average,
          color: "#98a6b8",
          dashStyle: "Dash",
          lineWidth: 1.5,
          zIndex: 1,
        },
        {
          type: "areaspline",
          name: "Selected",
          data: current,
          color: blue,
          lineWidth: 2.4,
          zIndex: 2,
          fillColor: {
            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
            stops: [
              [0, "rgba(47, 107, 255, 0.22)"],
              [1, "rgba(47, 107, 255, 0.02)"],
            ],
          },
        },
      ],
    };
  }, [average, current, height, yMax]);

  return <HighchartsReact highcharts={Highcharts} options={options} />;
}

function nearestIndex(points: Array<[number, number]>, x: number) {
  if (points.length === 0) {
    return 0;
  }
  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (points[mid][0] < x) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  const previous = Math.max(0, low - 1);
  return Math.abs(points[previous][0] - x) <= Math.abs(points[low][0] - x) ? previous : low;
}

export function PowerChart({
  points,
  start,
  end,
  height,
  onPick,
}: {
  points: Array<[number, number]>;
  start: number;
  end: number;
  height: number;
  onPick: (start: number, end: number) => void;
}) {
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const [chart, setChart] = useState<Highcharts.Chart | null>(null);
  const options = useMemo<Highcharts.Options>(() => {
    let dragged = false;
    return {
      chart: {
        ...baseChart(height, 8),
        zooming: { type: "x" },
        selectionMarkerFill: "rgba(21, 32, 51, 0.12)",
        events: {
          click(event) {
            if (dragged) {
              dragged = false;
              return;
            }
            const live = pointsRef.current;
            const axisChart = this as Highcharts.Chart;
            const value = axisChart.xAxis[0].toValue((event.chartX ?? 0) - axisChart.plotLeft, true);
            const index = nearestIndex(live, value);
            pickRef.current(index, index);
          },
          selection(event) {
            dragged = true;
            const live = pointsRef.current;
            const axis = event.xAxis?.[0];
            if (!axis) {
              pickRef.current(0, Math.max(0, live.length - 1));
              return false;
            }
            const first = nearestIndex(live, axis.min);
            const last = nearestIndex(live, axis.max);
            pickRef.current(Math.min(first, last), Math.max(first, last));
            return false;
          },
        },
      },
      title: { text: undefined },
      credits: { enabled: false },
      legend: { enabled: false },
      tooltip: {
        ...tooltip(),
        animation: false,
        formatter() {
          const total = Math.max(0, Math.round(this.x ?? 0));
          const minutes = Math.floor(total / 60);
          const seconds = total % 60;
          const watts = Math.round(this.y ?? 0);
          return `${minutes}:${String(seconds).padStart(2, "0")}<br/><b>${formatNumber(watts)} W</b>`;
        },
      },
      xAxis: {
        title: { text: "Time", style: labelStyle },
        min: points[0]?.[0] ?? 0,
        max: points[points.length - 1]?.[0] ?? 1,
        tickInterval: (points[points.length - 1]?.[0] ?? 0) - (points[0]?.[0] ?? 0) > 600 ? 300 : 60,
        lineColor: line,
        tickColor: line,
        labels: {
          style: labelStyle,
          formatter() {
            const total = Math.max(0, Math.round(Number(this.value)));
            const minutes = Math.floor(total / 60);
            const seconds = total % 60;
            return `${minutes}:${String(seconds).padStart(2, "0")}`;
          },
        },
      },
      yAxis: {
        title: { text: "Watts", style: labelStyle },
        min: 0,
        gridLineColor: line,
        labels: { style: labelStyle },
      },
      plotOptions: {
        series: {
          animation: false,
          cursor: "pointer",
          turboThreshold: 1,
          findNearestPointBy: "x",
          states: { hover: { enabled: false }, inactive: { opacity: 1 } },
          marker: { enabled: false, states: { hover: { enabled: false } } },
        },
      },
      series: [
        {
          type: "line",
          name: "Data",
          data: points,
          color: blue,
          lineWidth: 1.2,
        },
      ],
    };
  }, [height, points]);

  useEffect(() => {
    const axis = chart?.xAxis?.[0] as (Highcharts.Axis & {
      removePlotLine: (id: string) => void;
      removePlotBand: (id: string) => void;
      addPlotLine: (options: Highcharts.XAxisPlotLinesOptions) => void;
      addPlotBand: (options: Highcharts.XAxisPlotBandsOptions) => void;
    }) | undefined;
    if (!axis) {
      return;
    }
    axis.removePlotLine("selection");
    axis.removePlotBand("selection");
    const narrowed = start > 0 || end < points.length - 1;
    if (!narrowed || points.length === 0) {
      return;
    }
    const from = points[start]?.[0] ?? 0;
    const to = points[end]?.[0] ?? from;
    if (start === end) {
      axis.addPlotLine({ id: "selection", value: from, color: "#111111", width: 2, zIndex: 5 });
    } else {
      axis.addPlotBand({ id: "selection", from, to, color: "rgba(21, 32, 51, 0.14)" });
    }
  }, [chart, end, points, start]);

  return <HighchartsReact highcharts={Highcharts} options={options} callback={setChart} />;
}

export function OarlockChart({
  mode,
  current,
  average,
  yMax = 2000,
  height = 188,
}: {
  mode: "oarlock" | "footboard";
  current: Array<[number, number]>;
  average: Array<[number, number]>;
  yMax?: number;
  height?: number;
}) {
  const options = useMemo<Highcharts.Options>(() => {
    const currentName = mode === "footboard" ? "Footboard (selected)" : "Oarlock (selected)";
    const averageName = mode === "footboard" ? "Footboard (session)" : "Oarlock (session)";

    return {
      chart: baseChart(height, 8),
      title: { text: undefined },
      credits: { enabled: false },
      legend: { enabled: false },
      tooltip: {
        ...tooltip(),
        valueSuffix: " N",
      },
      ...axes("Force (N)", yMax, "Stroke Position (%)"),
      xAxis: {
        ...axes("", yMax, "Stroke Position (%)").xAxis,
        min: 0,
        max: 100,
        tickInterval: 20,
      },
      yAxis: {
        ...axes("Force (N)", yMax, "").yAxis,
        tickInterval: yMax > 800 ? 500 : 200,
      },
      plotOptions: sharedPlot,
      series: [
        {
          type: "line",
          name: averageName,
          data: average,
          color: "#98a6b8",
          dashStyle: "Dash",
          lineWidth: 1.5,
        },
        {
          type: "areaspline",
          name: currentName,
          data: current,
          color: mode === "footboard" ? "#22a06b" : blue,
          lineWidth: 2.2,
          fillColor: {
            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
            stops: [
              [0, mode === "footboard" ? "rgba(34, 160, 107, 0.2)" : "rgba(47, 107, 255, 0.2)"],
              [1, "rgba(47, 107, 255, 0.02)"],
            ],
          },
        },
      ],
    };
  }, [average, current, height, mode, yMax]);

  return <HighchartsReact highcharts={Highcharts} options={options} />;
}

export function ComparisonChart({ athletes, crew }: { athletes: Athlete[]; crew: number }) {
  const key = athletes.map((athlete) => athlete.id).join(",");
  const options = useMemo<Highcharts.Options>(() => {
    return {
      chart: baseChart(168, 8),
      title: { text: undefined },
      credits: { enabled: false },
      legend: { enabled: false },
      tooltip: tooltip(),
      ...axes("Force (N)", 2000, "Stroke Position (%)"),
      xAxis: {
        ...axes("", 2000, "Stroke Position (%)").xAxis,
        min: 0,
        max: 100,
        tickInterval: 20,
      },
      yAxis: {
        ...axes("Force (N)", 2000, "").yAxis,
        tickInterval: 500,
      },
      plotOptions: sharedPlot,
      series: [
        ...athletes.map((athlete) => ({
          type: "spline" as const,
          name: `Seat ${athlete.seat} (${athlete.name})`,
          data: forceShape(athlete.peakForce, athlete.seat * 0.008),
          color: athlete.color,
          lineWidth: 2,
        })),
        {
          type: "line" as const,
          name: "Crew Average",
          data: forceShape(crew, 0.02),
          color: "#98a6b8",
          dashStyle: "ShortDash" as const,
          lineWidth: 1.5,
        },
      ],
    };
  }, [athletes, crew, key]);

  return <HighchartsReact highcharts={Highcharts} options={options} />;
}

export function TrendChart({ mode, athlete }: { mode: "force" | "impulse" | "speed"; athlete: Athlete }) {
  const options = useMemo<Highcharts.Options>(() => {
    const speed = mode === "speed";
    return {
      chart: baseChart(156, 8),
      title: { text: undefined },
      credits: { enabled: false },
      legend: { enabled: false },
      tooltip: tooltip(),
      xAxis: {
        title: { text: "Stroke #", style: labelStyle },
        min: 1,
        max: 10,
        tickInterval: 1,
        lineColor: line,
        tickColor: line,
        labels: { style: labelStyle },
      },
      yAxis: {
        title: { text: speed ? "Boat speed (m/s)" : "Force (N)", style: labelStyle },
        min: 0,
        max: speed ? 8 : 2000,
        gridLineColor: line,
        labels: {
          style: labelStyle,
          formatter() {
            return formatNumber(Number(this.value));
          },
        },
      },
      plotOptions: sharedPlot,
      series: speed
        ? [
            {
              type: "spline",
              name: "Boat Speed",
              data: strokeWave(athlete.boatSpeed, 0.4),
              color: blue,
              lineWidth: 2,
            },
            {
              type: "spline",
              name: "Crew Average",
              data: strokeWave(athlete.boatSpeed * 0.94, 0.8),
              color: "#98a6b8",
              dashStyle: "Dash",
              lineWidth: 1.5,
            },
          ]
        : [
            {
              type: "spline",
              name: "Peak Force",
              data: strokeWave(mode === "impulse" ? athlete.impulse : athlete.peakForce, 0.2),
              color: blue,
              lineWidth: mode === "force" ? 2.2 : 1.4,
            },
            {
              type: "spline",
              name: "Avg Force",
              data: strokeWave(athlete.averageForce, 0.6),
              color: "#22a06b",
              lineWidth: 1.6,
            },
            {
              type: "spline",
              name: "Impulse (N·s)",
              data: strokeWave(athlete.impulse, 1),
              color: "#f59e0b",
              lineWidth: mode === "impulse" ? 2.2 : 1.4,
            },
          ],
    };
  }, [athlete, mode]);

  return <HighchartsReact highcharts={Highcharts} options={options} />;
}

export function Donut({ value, color, center }: { value: number; color: string; center: string }) {
  const options = useMemo<Highcharts.Options>(
    () => ({
      chart: {
        type: "pie",
        height: 112,
        backgroundColor: "transparent",
        spacing: [0, 0, 0, 0],
        margin: [0, 0, 0, 0],
      },
      title: { text: undefined },
      credits: { enabled: false },
      tooltip: { enabled: false },
      plotOptions: {
        pie: {
          innerSize: "74%",
          borderWidth: 0,
          dataLabels: { enabled: false },
          states: { hover: { enabled: false }, inactive: { opacity: 1 } },
        },
      },
      series: [
        {
          type: "pie",
          data: [
            { y: value, color },
            { y: Math.max(0, 100 - value), color: "#e8eef5" },
          ],
        },
      ],
    }),
    [value, color],
  );

  return (
    <div className="donut">
      <HighchartsReact highcharts={Highcharts} options={options} />
      <div className="donut-center">
        <span>{center}</span>
        <strong>{value}%</strong>
      </div>
    </div>
  );
}

export function PeakBarChart({ athletes }: { athletes: Athlete[] }) {
  const key = athletes.map((athlete) => `${athlete.id}:${athlete.peakForce}`).join("|");
  const options = useMemo<Highcharts.Options>(
    () => ({
      chart: baseChart(230, 8),
      title: { text: undefined },
      credits: { enabled: false },
      legend: { enabled: false },
      tooltip: { ...tooltip(), valueSuffix: " N" },
      xAxis: {
        categories: athletes.map((athlete) => athlete.name.split(" ")[0]),
        lineColor: line,
        tickColor: line,
        labels: { style: labelStyle },
      },
      yAxis: {
        title: { text: "Peak force (N)", style: labelStyle },
        min: 0,
        max: 2000,
        gridLineColor: line,
        labels: {
          style: labelStyle,
          formatter() {
            return formatNumber(Number(this.value));
          },
        },
      },
      plotOptions: {
        column: { borderWidth: 0, borderRadius: 5, animation: false },
      },
      series: [
        {
          type: "column",
          name: "Peak Force",
          data: athletes.map((athlete) => ({ y: athlete.peakForce, color: athlete.color })),
        },
      ],
    }),
    [athletes, key],
  );

  return <HighchartsReact highcharts={Highcharts} options={options} />;
}
