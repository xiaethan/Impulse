import { useMemo, type ComponentType } from "react";
import Highcharts from "highcharts";
import "highcharts/highcharts-more";
import HighchartsReactModule from "highcharts-react-official";
import { formatNumber, type Athlete } from "./data";

const HighchartsReact: ComponentType<{
  highcharts: typeof Highcharts;
  options: Highcharts.Options;
}> =
  typeof HighchartsReactModule === "function"
    ? HighchartsReactModule
    : (
        HighchartsReactModule as unknown as {
          HighchartsReact: ComponentType<{
            highcharts: typeof Highcharts;
            options: Highcharts.Options;
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

export function ForceCurveChart({ peak }: { peak: number }) {
  const options = useMemo<Highcharts.Options>(() => {
    const curve = forceShape(peak);
    const crew = forceShape(Math.round(peak * 0.9), 0.02);
    let peakIndex = 0;
    curve.forEach((point, index) => {
      if (point[1] > curve[peakIndex][1]) {
        peakIndex = index;
      }
    });
    const peakPoint = curve[peakIndex];
    const current = curve.map((point, index) =>
      index === peakIndex
        ? {
            x: point[0],
            y: point[1],
            dataLabels: {
              enabled: true,
              useHTML: true,
              crop: false,
              overflow: "allow" as const,
              y: -4,
              format: `<span class="peak-callout">Peak Force<b>${formatNumber(point[1])} N</b></span>`,
            },
          }
        : { x: point[0], y: point[1] },
    );

    return {
      chart: baseChart(228, 28),
      title: { text: undefined },
      credits: { enabled: false },
      legend: { enabled: false },
      tooltip: tooltip(),
      ...axes("Force (N)", 2000, "Stroke Position (%)"),
      xAxis: {
        ...axes("Force (N)", 2000, "Stroke Position (%)").xAxis,
        min: 0,
        max: 100,
        tickInterval: 20,
        plotLines: [
          {
            value: peakPoint[0],
            color: "#c5d0de",
            dashStyle: "Dash",
            width: 1,
            zIndex: 4,
          },
        ],
      },
      yAxis: {
        ...axes("Force (N)", 2000, "Stroke Position (%)").yAxis,
        tickInterval: 500,
      },
      plotOptions: sharedPlot,
      series: [
        {
          type: "arearange",
          name: "Target Range",
          data: crew.map(([x, y]) => [x, Math.round(y * 0.78), Math.round(y * 1.16)]),
          color: "rgba(47, 107, 255, 0.14)",
          lineWidth: 0,
          marker: { enabled: false },
          enableMouseTracking: false,
          zIndex: 0,
        } as Highcharts.SeriesArearangeOptions,
        {
          type: "line",
          name: "Crew Average",
          data: crew,
          color: "#98a6b8",
          dashStyle: "Dash",
          lineWidth: 1.5,
          zIndex: 1,
        },
        {
          type: "areaspline",
          name: "Current Stroke",
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
  }, [peak]);

  return <HighchartsReact highcharts={Highcharts} options={options} />;
}

export function OarlockChart({ mode, peak }: { mode: "oarlock" | "footboard" | "percent"; peak: number }) {
  const options = useMemo<Highcharts.Options>(() => {
    const scale = mode === "percent" ? 38 : mode === "footboard" ? Math.round(peak * 0.42) : Math.round(peak * 0.9);
    const yMax = mode === "percent" ? 100 : mode === "footboard" ? 1000 : 2000;
    const currentName = mode === "percent" ? "Footboard %" : mode === "footboard" ? "Footboard (current)" : "Oarlock (current)";
    const averageName = mode === "percent" ? "Crew average" : mode === "footboard" ? "Footboard (avg)" : "Oarlock (avg)";
    const suffix = mode === "percent" ? "%" : " N";

    return {
      chart: baseChart(188, 8),
      title: { text: undefined },
      credits: { enabled: false },
      legend: { enabled: false },
      tooltip: {
        ...tooltip(),
        valueSuffix: suffix,
      },
      ...axes(mode === "percent" ? "Footboard %" : "Force (N)", yMax, "Stroke Position (%)"),
      xAxis: {
        ...axes("", yMax, "Stroke Position (%)").xAxis,
        min: 0,
        max: 100,
        tickInterval: 20,
      },
      yAxis: {
        ...axes(mode === "percent" ? "Footboard %" : "Force (N)", yMax, "").yAxis,
        tickInterval: mode === "percent" ? 20 : undefined,
      },
      plotOptions: sharedPlot,
      series: [
        {
          type: "line",
          name: averageName,
          data: forceShape(Math.round(scale * 0.86), 0.03),
          color: "#98a6b8",
          dashStyle: "Dash",
          lineWidth: 1.5,
        },
        {
          type: "areaspline",
          name: currentName,
          data: forceShape(scale),
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
  }, [mode, peak]);

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
