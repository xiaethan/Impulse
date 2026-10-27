export type InsightTone = "info" | "warn" | "good";

export type Insight = {
  tone: InsightTone;
  text: string;
};

export type Athlete = {
  id: string;
  seat: number;
  name: string;
  detail?: string;
  speedKmh: number;
  color: string;
  peakForce: number;
  averageForce: number;
  impulse: number;
  driveTime: number;
  recoveryTime: number;
  catchAngle: number;
  releaseAngle: number;
  connectedDrive: number;
  peakForcePct: number;
  driveLength: number;
  boatSpeed: number;
  strokeRate: number;
  driveShare: number;
  footboardShare: number;
  footboardForce: number;
  oarlockForce: number;
  deltas: {
    peakForce: number;
    averageForce: number;
    impulse: number;
    driveTime: number;
    recoveryTime: number;
    catchAngle: number;
    releaseAngle: number;
    connectedDrive: number;
    peakForcePct: number;
    driveLength: number;
    boatSpeed: number;
  };
};

export type Crew = {
  id: string;
  label: string;
  session: string;
  seats: number;
};

export type StrokeRow = {
  n: number;
  peak: number;
  avg: number;
  impulse: number;
  drive: number;
  speed: number;
};

type Seed = {
  id: string;
  seat: number;
  name: string;
  detail?: string;
  speedKmh: number;
  color: string;
  scale: number;
  delta: number;
};

const SEEDS: Seed[] = [
  { id: "alex", seat: 1, name: "Alex Chen", detail: "Stroke", speedKmh: 6.8, color: "#3b82f6", scale: 0.97, delta: -1 },
  { id: "ethan", seat: 2, name: "Ethan Xia", speedKmh: 7.4, color: "#22a06b", scale: 1, delta: 0 },
  { id: "matt", seat: 3, name: "Matt Johnson", speedKmh: 6.6, color: "#f59e0b", scale: 0.94, delta: -2 },
  { id: "daniel", seat: 4, name: "Daniel Kim", speedKmh: 6.9, color: "#ef4444", scale: 0.98, delta: 1 },
  { id: "sam", seat: 5, name: "Sam Rivera", speedKmh: 6.7, color: "#8b5cf6", scale: 0.93, delta: -1 },
  { id: "chris", seat: 6, name: "Chris Park", speedKmh: 6.4, color: "#06b6d4", scale: 0.91, delta: -2 },
  { id: "owen", seat: 7, name: "Owen Park", speedKmh: 6.6, color: "#eab308", scale: 0.9, delta: -3 },
  { id: "niels", seat: 8, name: "Niels Terwesch", speedKmh: 6.5, color: "#64748b", scale: 0.92, delta: -1 },
];

function build(seed: Seed): Athlete {
  const factor = seed.scale;
  const shift = 1 - factor;
  return {
    id: seed.id,
    seat: seed.seat,
    name: seed.name,
    detail: seed.detail,
    speedKmh: seed.speedKmh,
    color: seed.color,
    peakForce: Math.round(1682 * factor),
    averageForce: Math.round(1124 * factor),
    impulse: Math.round(921 * factor),
    driveTime: Number((0.82 + shift * 0.12).toFixed(2)),
    recoveryTime: Number((1.08 - shift * 0.08).toFixed(2)),
    catchAngle: Math.round(13 + shift * 8),
    releaseAngle: Math.round(38 - shift * 6),
    connectedDrive: Math.round(72 * (0.9 + 0.1 * factor)),
    peakForcePct: Math.round(94 * (0.92 + 0.08 * factor)),
    driveLength: Number((1.62 * factor).toFixed(2)),
    boatSpeed: Number((5.8 * (0.96 + 0.04 * factor)).toFixed(1)),
    strokeRate: 32,
    driveShare: Math.round(43 - shift * 10),
    footboardShare: Math.round(28 * (0.9 + 0.1 * factor)),
    footboardForce: Math.round(487 * factor),
    oarlockForce: Math.round(1245 * factor),
    deltas: {
      peakForce: 6 + seed.delta,
      averageForce: 4 + seed.delta,
      impulse: 8 + seed.delta,
      driveTime: 3 + seed.delta,
      recoveryTime: 5 + seed.delta,
      catchAngle: 2 + seed.delta,
      releaseAngle: 1 + seed.delta,
      connectedDrive: 4 + seed.delta,
      peakForcePct: 3 + seed.delta,
      driveLength: 6 + seed.delta,
      boatSpeed: 3 + seed.delta,
    },
  };
}

export const ATHLETES: Athlete[] = SEEDS.map(build);

export const CREWS: Crew[] = [
  { id: "ml8", label: "Men's Lightweight 8+", session: "Penn Lightweight 8+", seats: 8 },
  { id: "ml4", label: "Men's Lightweight 4+", session: "Penn Lightweight 4+", seats: 4 },
];

export const BOATS = ["Boat 1", "Boat 2"];

export const WORKOUTS = ["2 x 20' (UT2)", "3 x 15' (UT1)", "Steady state"];

export const SESSION = {
  team: "Penn Lightweight Rowing",
  strokeRate: 32,
  boatSpeed: 5.8,
  boatSpeedKmh: 11.3,
  distance: 1624,
  elapsed: "6:48",
  started: "Today, 5:12 AM · 42 min elapsed",
};

const STROKES: StrokeRow[] = [
  { n: 1, peak: 1612, avg: 1084, impulse: 874, drive: 0.8, speed: 5.7 },
  { n: 2, peak: 1655, avg: 1098, impulse: 901, drive: 0.81, speed: 5.8 },
  { n: 3, peak: 1644, avg: 1132, impulse: 918, drive: 0.82, speed: 5.9 },
  { n: 4, peak: 1672, avg: 1121, impulse: 920, drive: 0.83, speed: 5.8 },
  { n: 5, peak: 1658, avg: 1109, impulse: 912, drive: 0.82, speed: 5.8 },
  { n: 6, peak: 1701, avg: 1146, impulse: 955, drive: 0.84, speed: 5.9 },
  { n: 7, peak: 1688, avg: 1138, impulse: 941, drive: 0.81, speed: 5.8 },
  { n: 8, peak: 1676, avg: 1142, impulse: 945, drive: 0.83, speed: 5.8 },
  { n: 9, peak: 1693, avg: 1141, impulse: 948, drive: 0.83, speed: 5.9 },
  { n: 10, peak: 1682, avg: 1134, impulse: 940, drive: 0.82, speed: 5.8 },
];

export const PAST_SESSIONS = [
  { id: "now", name: "2 x 20' (UT2)", when: "Today, 5:12 AM", meta: "42 min elapsed", distance: "1,624 m", rate: "32 spm", status: "In progress" },
  { id: "ut1", name: "3 x 15' (UT1)", when: "Yesterday, 5:30 AM", meta: "58 min", distance: "12.4 km", rate: "28 spm", status: "Complete" },
  { id: "race", name: "Race pieces", when: "Oct 24, 4:45 PM", meta: "36 min", distance: "6.2 km", rate: "36 spm", status: "Complete" },
  { id: "steady", name: "Steady state", when: "Oct 22, 5:18 AM", meta: "74 min", distance: "16.1 km", rate: "24 spm", status: "Complete" },
];

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function rosterFor(seats: number) {
  return ATHLETES.filter((athlete) => athlete.seat <= seats);
}

export function crewPeak(athletes: Athlete[]) {
  if (athletes.length === 0) {
    return 1500;
  }
  return Math.round(athletes.reduce((sum, athlete) => sum + athlete.peakForce, 0) / athletes.length);
}

export function strokesFor(athlete: Athlete): StrokeRow[] {
  const factor = athlete.peakForce / 1682;
  return STROKES.map((row) => ({
    n: row.n,
    peak: Math.round(row.peak * factor),
    avg: Math.round(row.avg * factor),
    impulse: Math.round(row.impulse * factor),
    drive: Number((row.drive * (0.97 + 0.03 * factor)).toFixed(2)),
    speed: Number((row.speed * (0.96 + 0.04 * (athlete.boatSpeed / 5.8))).toFixed(1)),
  }));
}

export function insightsFor(athlete: Athlete): Insight[] {
  if (athlete.id === "ethan") {
    return [
      { tone: "info", text: "Seat 2 is 4% below crew average at the catch. Focus on earlier connection and a higher initial load." },
      { tone: "warn", text: "Stroke 6 shows reduced early-drive force (−6% vs. 32% crew avg). Check rhythm and leg drive timing." },
      { tone: "info", text: "Footboard force contribution is slightly low (28% vs. 32% crew avg). Look for more consistent leg drive through the finish." },
      { tone: "good", text: "Overall crew speed is up 3% compared to last session. Good consistency in the drive phase." },
    ];
  }

  const catchDelta = athlete.deltas.catchAngle;
  const catchText =
    catchDelta === 0
      ? `${athlete.name} is level with the crew average at the catch. Keep the early connection and initial load.`
      : `${athlete.name} is ${Math.abs(catchDelta)}% ${catchDelta > 0 ? "above" : "below"} crew average at the catch. Focus on earlier connection and a higher initial load.`;
  return [
    {
      tone: "info",
      text: catchText,
    },
    {
      tone: "warn",
      text: `Stroke 6 shows reduced early-drive force for seat ${athlete.seat}. Check rhythm and leg drive timing.`,
    },
    {
      tone: "info",
      text: `Footboard force contribution is ${athlete.footboardShare}% of peak force. Crew average is 32%.`,
    },
    {
      tone: "good",
      text: "Overall crew speed is up 3% compared to last session. Good consistency in the drive phase.",
    },
  ];
}
