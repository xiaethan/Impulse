import { useEffect, useState } from "react";
import { initialsFromEmail, useAuth } from "./auth";
import { ComparisonChart, Donut, ForceCurveChart, OarlockChart, PeakBarChart, TrendChart } from "./charts";
import {
  BOATS,
  CREWS,
  PAST_SESSIONS,
  SESSION,
  WORKOUTS,
  crewPeak,
  formatNumber,
  insightsFor,
  rosterFor,
  strokesFor,
  type Athlete,
  type Crew,
  type InsightTone,
} from "./data";

type Page = "dashboard" | "live" | "athletes" | "sessions" | "analytics";
type Status = "loading" | "ok" | "down";
type OarMode = "oarlock" | "footboard" | "percent";
type TrendMode = "force" | "impulse" | "speed";

const PAGES: Array<{ id: Page; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "live", label: "Live Session" },
  { id: "athletes", label: "Athletes" },
  { id: "sessions", label: "Sessions" },
  { id: "analytics", label: "Team Analytics" },
];

export function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [status, setStatus] = useState<Status>("loading");
  const [crewId, setCrewId] = useState(CREWS[0].id);
  const [boat, setBoat] = useState(BOATS[0]);
  const [workout, setWorkout] = useState(WORKOUTS[0]);
  const [selectedId, setSelectedId] = useState("ethan");
  const [paused, setPaused] = useState(false);
  const [oarMode, setOarMode] = useState<OarMode>("oarlock");
  const [trendMode, setTrendMode] = useState<TrendMode>("force");
  const [teamOpen, setTeamOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { email, logout } = useAuth();
  const initials = initialsFromEmail(email);

  const crew = CREWS.find((item) => item.id === crewId) ?? CREWS[0];
  const roster = rosterFor(crew.seats);
  const athlete = roster.find((item) => item.id === selectedId) ?? roster[0];
  const monitoring = page === "dashboard" || page === "live";

  useEffect(() => {
    let active = true;
    fetch("/api/health")
      .then((response) => (response.ok ? ("ok" as const) : ("down" as const)))
      .then((next) => {
        if (active) {
          setStatus(next);
        }
      })
      .catch(() => {
        if (active) {
          setStatus("down");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const visible = rosterFor(crew.seats);
    if (!visible.some((item) => item.id === selectedId)) {
      setSelectedId(visible[0].id);
    }
  }, [crew.seats, selectedId]);

  function chooseCrew(next: Crew) {
    setCrewId(next.id);
    const visible = rosterFor(next.seats);
    if (!visible.some((item) => item.id === selectedId)) {
      setSelectedId(visible[0].id);
    }
  }

  function closeMenus() {
    setTeamOpen(false);
    setProfileOpen(false);
  }

  return (
    <div className="shell">
      <header className="topbar">
        <button className="brand" type="button" aria-label="Impulse" onClick={() => setPage("dashboard")}>
          <img src="/impulse-logo.png?v=2" alt="Impulse" />
        </button>
        <nav className="nav" aria-label="Primary">
          {PAGES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={page === item.id ? "page" : undefined}
              onClick={() => {
                closeMenus();
                setPage(item.id);
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <span className="live-pill" data-status={status}>
            <span className="live-dot" />
            {status === "ok" && "Recording Live"}
            {status === "loading" && "Connecting"}
            {status === "down" && "Offline"}
          </span>
          <div className="menu-wrap">
            <button
              className="team"
              type="button"
              aria-expanded={teamOpen}
              onClick={() => {
                setTeamOpen((open) => !open);
                setProfileOpen(false);
              }}
            >
              <PennMark />
              <span>{SESSION.team}</span>
              <Chevron />
            </button>
            {teamOpen && (
              <div className="menu" role="menu">
                <p className="menu-label">Team</p>
                <button className="menu-item current" type="button" role="menuitem" onClick={closeMenus}>
                  <PennMark />
                  {SESSION.team}
                </button>
              </div>
            )}
          </div>
          <div className="menu-wrap">
            <button
              className="profile"
              type="button"
              aria-expanded={profileOpen}
              onClick={() => {
                setProfileOpen((open) => !open);
                setTeamOpen(false);
              }}
            >
              <span className="avatar">{initials}</span>
              <span>Coach</span>
            </button>
            {profileOpen && (
              <div className="menu profile-menu" role="menu">
                <p className="menu-label">Profile</p>
                <div className="profile-card">
                  <span className="avatar">{initials}</span>
                  <span>
                    <strong>Coach</strong>
                    <small>{email}</small>
                  </span>
                </div>
                <button
                  className="menu-item logout"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeMenus();
                    void logout();
                  }}
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      {(teamOpen || profileOpen) && <button className="backdrop" type="button" aria-label="Close menu" onClick={closeMenus} />}
      <div className={monitoring ? "body" : "body wide"}>
        <Sidebar
          crew={crew}
          boat={boat}
          workout={workout}
          roster={roster}
          selectedId={athlete.id}
          onCrew={chooseCrew}
          onBoat={setBoat}
          onWorkout={setWorkout}
          onSelect={setSelectedId}
        />
        <main className="stage">
          {monitoring ? (
            <LiveBoard
              athlete={athlete}
              roster={roster}
              crew={crew}
              boat={boat}
              workout={workout}
              paused={paused}
              oarMode={oarMode}
              trendMode={trendMode}
              onPause={() => setPaused((value) => !value)}
              onOar={setOarMode}
              onTrend={setTrendMode}
            />
          ) : page === "athletes" ? (
            <AthletesPage roster={roster} selectedId={athlete.id} onSelect={setSelectedId} />
          ) : page === "sessions" ? (
            <SessionsPage
              workout={workout}
              onOpen={(name) => {
                if (WORKOUTS.includes(name)) {
                  setWorkout(name);
                }
                setPage("live");
              }}
            />
          ) : (
            <AnalyticsPage roster={roster} />
          )}
        </main>
        {monitoring && <Metrics athlete={athlete} />}
      </div>
    </div>
  );
}

function Sidebar({
  crew,
  boat,
  workout,
  roster,
  selectedId,
  onCrew,
  onBoat,
  onWorkout,
  onSelect,
}: {
  crew: Crew;
  boat: string;
  workout: string;
  roster: Athlete[];
  selectedId: string;
  onCrew: (crew: Crew) => void;
  onBoat: (boat: string) => void;
  onWorkout: (workout: string) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="sidebar">
      <label className="field">
        <span>Crew</span>
        <select value={crew.id} onChange={(event) => onCrew(CREWS.find((item) => item.id === event.target.value) ?? CREWS[0])}>
          {CREWS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Boat</span>
        <select value={boat} onChange={(event) => onBoat(event.target.value)}>
          {BOATS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      <div className="athlete-list">
        {roster.map((item) => {
          const selected = item.id === selectedId;
          return (
            <button
              key={item.id}
              type="button"
              className={selected ? "athlete selected" : "athlete"}
              aria-pressed={selected}
              onClick={() => onSelect(item.id)}
            >
              <span className="seat-no">{item.seat}</span>
              <span className="dot" style={{ background: item.color }} />
              <span className="athlete-copy">
                <span className="athlete-name">{item.name}</span>
                {item.detail && <span className="athlete-role">{item.detail}</span>}
              </span>
              <span className="athlete-speed">{item.speedKmh.toFixed(1)} km/h</span>
            </button>
          );
        })}
      </div>
      <BoatMap athletes={roster} selectedId={selectedId} onSelect={onSelect} />
      <label className="workout-card">
        <span>Workout</span>
        <select value={workout} onChange={(event) => onWorkout(event.target.value)}>
          {WORKOUTS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <small>{SESSION.started}</small>
      </label>
    </aside>
  );
}

function BoatMap({
  athletes,
  selectedId,
  onSelect,
}: {
  athletes: Athlete[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const count = athletes.length;
  return (
    <svg className="boat" viewBox="0 0 240 78" role="img" aria-label="Boat seats">
      <path
        d="M14 40 C14 29 28 24 42 24 H178 C202 24 218 31 230 40 C218 49 202 56 178 56 H42 C28 56 14 51 14 40 Z"
        fill="#eef3f8"
        stroke="#d5deea"
      />
      <path d="M46 40 H196" stroke="#d5deea" strokeWidth="1" />
      <path d="M230 40 H236" stroke="#9aabbd" strokeWidth="2" strokeLinecap="round" />
      {athletes.map((athlete, index) => {
        const x = count === 1 ? 120 : 40 + index * (156 / (count - 1));
        const selected = athlete.id === selectedId;
        return (
          <g key={athlete.id} className="boat-seat" onClick={() => onSelect(athlete.id)}>
            <circle cx={x} cy={40} r={selected ? 8 : 6.5} fill={athlete.color} />
            <text x={x} y={70} textAnchor="middle" fontSize="10" fill="#7b8798">
              {athlete.seat}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function LiveBoard({
  athlete,
  roster,
  crew,
  boat,
  workout,
  paused,
  oarMode,
  trendMode,
  onPause,
  onOar,
  onTrend,
}: {
  athlete: Athlete;
  roster: Athlete[];
  crew: Crew;
  boat: string;
  workout: string;
  paused: boolean;
  oarMode: OarMode;
  trendMode: TrendMode;
  onPause: () => void;
  onOar: (mode: OarMode) => void;
  onTrend: (mode: TrendMode) => void;
}) {
  const neighbor =
    roster.find((item) => item.seat === athlete.seat + 1) ?? roster.find((item) => item.seat === athlete.seat - 1);
  const compared = neighbor ? [athlete, neighbor] : [athlete];
  const strokes = strokesFor(athlete);
  const average = crewPeak(roster);
  const seatLabel =
    compared.length === 2
      ? `Seats ${Math.min(compared[0].seat, compared[1].seat)}–${Math.max(compared[0].seat, compared[1].seat)}`
      : `Seat ${athlete.seat}`;

  return (
    <div className="live">
      <section className="card session-card">
        <div className="session-top">
          <div>
            <h1>
              Live Session
              <span className={paused ? "badge paused" : "badge"}>{paused ? "Paused" : "In Progress"}</span>
            </h1>
            <p className="session-sub">
              {crew.session} / {workout}
              <span> · {boat}</span>
            </p>
          </div>
          <div className="session-actions">
            <button className={paused ? "record paused" : "record"} type="button" onClick={onPause}>
              <i />
              {paused ? "Paused" : "Recording"}
            </button>
            <button className="pause" type="button" aria-label={paused ? "Resume session" : "Pause session"} onClick={onPause}>
              {paused ? <PlayIcon /> : <PauseIcon />}
            </button>
          </div>
        </div>
        <div className="stats">
          <Stat label="Stroke Rate" value={`${SESSION.strokeRate} spm`} />
          <Stat label="Boat Speed" value={`${SESSION.boatSpeed.toFixed(1)} m/s`} hint={`(${SESSION.boatSpeedKmh.toFixed(1)} km/h)`} />
          <Stat label="Distance" value={`${formatNumber(SESSION.distance)} m`} />
          <Stat label="Elapsed Time" value={SESSION.elapsed} />
        </div>
      </section>

      <div className="chart-row">
        <section className="card">
          <div className="card-head">
            <h2>
              Force Curve <InfoTip text="Force through the stroke, with the crew average and target range." />
            </h2>
            <Legend
              items={[
                { label: "Current Stroke", swatch: "line" },
                { label: "Crew Average", swatch: "dashed" },
                { label: "Target Range", swatch: "range" },
              ]}
            />
          </div>
          <p className="card-sub">
            Seat {athlete.seat} — {athlete.name}
          </p>
          <ForceCurveChart peak={athlete.peakForce} />
        </section>
        <section className="card">
          <div className="card-head">
            <Tabs
              value={oarMode}
              onChange={onOar}
              options={[
                { id: "oarlock", label: "Oarlock Force" },
                { id: "footboard", label: "Footboard Force" },
                { id: "percent", label: "Footboard %" },
              ]}
            />
          </div>
          <OarlockChart mode={oarMode} peak={athlete.peakForce} />
          <Legend
            items={
              oarMode === "percent"
                ? [
                    { label: "Footboard %", swatch: "line", color: "#2f6bff" },
                    { label: "Crew average", swatch: "dashed" },
                  ]
                : [
                    {
                      label: oarMode === "footboard" ? "Footboard (current)" : "Oarlock (current)",
                      swatch: "line",
                      color: oarMode === "footboard" ? "#22a06b" : "#2f6bff",
                    },
                    { label: oarMode === "footboard" ? "Footboard (avg)" : "Oarlock (avg)", swatch: "dashed" },
                  ]
            }
          />
        </section>
      </div>

      <div className="lower">
        <section className="card">
          <div className="card-head">
            <h2>
              Athlete Comparison <span>{seatLabel}</span>
            </h2>
          </div>
          <Legend
            items={[
              ...compared.map((item) => ({
                label: `Seat ${item.seat} (${item.name})`,
                swatch: "line" as const,
                color: item.color,
              })),
              { label: "Crew Average", swatch: "dashed" as const },
            ]}
          />
          <ComparisonChart athletes={compared} crew={average} />
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Recent Strokes (Seat {athlete.seat})</h2>
          </div>
          <div className="table-wrap">
            <table className="strokes">
              <thead>
                <tr>
                  <th>Stroke #</th>
                  <th>Peak Force (N)</th>
                  <th>Avg Force (N)</th>
                  <th>Impulse (N·s)</th>
                  <th>Drive Time (s)</th>
                  <th>Boat Speed (m/s)</th>
                </tr>
              </thead>
              <tbody>
                {strokes.map((row) => (
                  <tr key={row.n} className={row.n === strokes.length ? "current" : undefined}>
                    <td>{row.n}</td>
                    <td>{formatNumber(row.peak)}</td>
                    <td>{formatNumber(row.avg)}</td>
                    <td>{formatNumber(row.impulse)}</td>
                    <td>{row.drive.toFixed(2)}</td>
                    <td>{row.speed.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card technique">
          <div className="card-head">
            <h2>Force & Technique Breakdown</h2>
          </div>
          <div className="donuts">
            <div>
              <p className="donut-title">Drive vs. Recovery</p>
              <Donut value={athlete.driveShare} color="#2f6bff" center="Drive" />
            </div>
            <div>
              <p className="donut-title">Force Contribution</p>
              <Donut value={athlete.footboardShare} color="#22a06b" center="Footboard" />
            </div>
          </div>
          <dl className="tech-stats">
            <div>
              <dt>Drive Time</dt>
              <dd>{athlete.driveTime.toFixed(2)} s</dd>
            </div>
            <div>
              <dt>Recovery Time</dt>
              <dd>{athlete.recoveryTime.toFixed(2)} s</dd>
            </div>
            <div>
              <dt>Footboard Force</dt>
              <dd>{formatNumber(athlete.footboardForce)} N</dd>
            </div>
            <div>
              <dt>Oarlock Force</dt>
              <dd>{formatNumber(athlete.oarlockForce)} N</dd>
            </div>
          </dl>
          <div className="note">
            <strong>Footboard Contribution</strong>
            Footboard force accounts for {athlete.footboardShare}% of total force at peak drive. Crew average: 32%.
          </div>
          <div className="rhythm">
            <strong>Good rhythm and consistent force.</strong>
            Keep an eye on early-drive force and footboard contribution as we head into the second 20'.
          </div>
          <span className="watermark">Impulse</span>
        </section>
        <section className="card trends">
          <div className="card-head">
            <h2>Crew Trends (Seat {athlete.seat})</h2>
            <div className="trend-tools">
              <Tabs
                value={trendMode}
                onChange={onTrend}
                options={[
                  { id: "force", label: "Force" },
                  { id: "impulse", label: "Impulse" },
                  { id: "speed", label: "Boat Speed" },
                ]}
              />
              <span className="card-sub">Last 10 Strokes</span>
            </div>
          </div>
          <TrendChart mode={trendMode} athlete={athlete} />
          <Legend
            items={
              trendMode === "speed"
                ? [
                    { label: "Boat Speed", swatch: "line", color: "#2f6bff" },
                    { label: "Crew Average", swatch: "dashed" },
                  ]
                : [
                    { label: "Peak Force", swatch: "line", color: "#2f6bff" },
                    { label: "Avg Force", swatch: "line", color: "#22a06b" },
                    { label: "Impulse (N·s)", swatch: "line", color: "#f59e0b" },
                  ]
            }
          />
        </section>
      </div>
    </div>
  );
}

function Metrics({ athlete }: { athlete: Athlete }) {
  const rows: Array<{ label: string; value: string; delta?: number; note?: string }> = [
    { label: "Peak Force", value: `${formatNumber(athlete.peakForce)} N`, delta: athlete.deltas.peakForce },
    { label: "Average Force", value: `${formatNumber(athlete.averageForce)} N`, delta: athlete.deltas.averageForce },
    { label: "Force Impulse", value: `${formatNumber(athlete.impulse)} N·s`, delta: athlete.deltas.impulse },
    { label: "Drive Time", value: `${athlete.driveTime.toFixed(2)} s`, delta: athlete.deltas.driveTime },
    { label: "Recovery Time", value: `${athlete.recoveryTime.toFixed(2)} s`, delta: athlete.deltas.recoveryTime },
    { label: "Catch Angle", value: `${athlete.catchAngle}°`, delta: athlete.deltas.catchAngle },
    { label: "Release Angle", value: `${athlete.releaseAngle}°`, delta: athlete.deltas.releaseAngle },
    { label: "Connected Drive", value: `${athlete.connectedDrive}%`, delta: athlete.deltas.connectedDrive },
    { label: "Peak Force %", value: `${athlete.peakForcePct}%`, delta: athlete.deltas.peakForcePct },
    { label: "Drive Length", value: `${athlete.driveLength.toFixed(2)} m`, delta: athlete.deltas.driveLength },
    { label: "Stroke Rate", value: `${athlete.strokeRate} spm`, note: "vs crew avg" },
    { label: "Boat Speed", value: `${athlete.boatSpeed.toFixed(1)} m/s`, delta: athlete.deltas.boatSpeed },
  ];
  const insights = insightsFor(athlete);

  return (
    <aside className="rail">
      <section className="card metrics">
        <h2>Key Metrics (Seat {athlete.seat})</h2>
        <ul>
          {rows.map((row) => (
            <li key={row.label}>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
              {row.note ? (
                <em className="delta flat">{row.note}</em>
              ) : (
                <em className={row.delta !== undefined && row.delta < 0 ? "delta down" : "delta up"}>
                  {row.delta !== undefined && row.delta < 0 ? "▼" : "▲"} {Math.abs(row.delta ?? 0)}%
                  <small>vs crew avg</small>
                </em>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="card insights">
        <h2>
          <Bulb /> Insights & Coaching Notes
        </h2>
        <ul>
          {insights.map((insight) => (
            <li key={insight.text} className={insight.tone}>
              <InsightMark tone={insight.tone} />
              <p>{insight.text}</p>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

function AthletesPage({
  roster,
  selectedId,
  onSelect,
}: {
  roster: Athlete[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const selected = roster.find((item) => item.id === selectedId) ?? roster[0];
  return (
    <div className="page">
      <header className="page-head">
        <h1>Athletes</h1>
        <p>{roster.length} rowers in this lineup. Select a seat to compare force, impulse, and drive time.</p>
      </header>
      <div className="athlete-grid">
        {roster.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === selected.id ? "person selected" : "person"}
            onClick={() => onSelect(item.id)}
          >
            <span className="person-bar" style={{ background: item.color }} />
            <span className="person-seat">Seat {item.seat}</span>
            <strong>{item.name}</strong>
            <span>{item.detail ?? `${item.speedKmh.toFixed(1)} km/h`}</span>
            <dl>
              <div>
                <dt>Peak</dt>
                <dd>{formatNumber(item.peakForce)} N</dd>
              </div>
              <div>
                <dt>Impulse</dt>
                <dd>{formatNumber(item.impulse)} N·s</dd>
              </div>
              <div>
                <dt>Drive</dt>
                <dd>{item.driveTime.toFixed(2)} s</dd>
              </div>
            </dl>
          </button>
        ))}
      </div>
    </div>
  );
}

function SessionsPage({ workout, onOpen }: { workout: string; onOpen: (name: string) => void }) {
  return (
    <div className="page">
      <header className="page-head">
        <h1>Sessions</h1>
        <p>Current workout is {workout}. Open a session to view it on the live board.</p>
      </header>
      <div className="session-list">
        {PAST_SESSIONS.map((session) => (
          <button key={session.id} type="button" className="session-row" onClick={() => onOpen(session.name)}>
            <span>
              <strong>{session.name}</strong>
              <small>{session.when}</small>
            </span>
            <span>{session.meta}</span>
            <span>{session.distance}</span>
            <span>{session.rate}</span>
            <em className={session.status === "In progress" ? "status live" : "status"}>{session.status}</em>
          </button>
        ))}
      </div>
    </div>
  );
}

function AnalyticsPage({ roster }: { roster: Athlete[] }) {
  const peak = crewPeak(roster);
  const impulse = Math.round(roster.reduce((sum, item) => sum + item.impulse, 0) / roster.length);
  const drive = roster.reduce((sum, item) => sum + item.driveTime, 0) / roster.length;
  return (
    <div className="page">
      <header className="page-head">
        <h1>Team Analytics</h1>
        <p>Crew averages for {SESSION.team} across the current lineup.</p>
      </header>
      <div className="summary">
        <Stat label="Avg peak force" value={`${formatNumber(peak)} N`} />
        <Stat label="Avg impulse" value={`${formatNumber(impulse)} N·s`} />
        <Stat label="Avg drive time" value={`${drive.toFixed(2)} s`} />
        <Stat label="Boat speed" value={`${SESSION.boatSpeed.toFixed(1)} m/s`} />
      </div>
      <section className="card">
        <div className="card-head">
          <h2>Peak force by seat</h2>
        </div>
        <PeakBarChart athletes={roster} />
      </section>
      <section className="card table-card">
        <div className="table-wrap">
          <table className="strokes">
            <thead>
              <tr>
                <th>Seat</th>
                <th>Athlete</th>
                <th>Peak Force (N)</th>
                <th>Avg Force (N)</th>
                <th>Impulse (N·s)</th>
                <th>Drive (s)</th>
                <th>Speed (km/h)</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((item) => (
                <tr key={item.id}>
                  <td>{item.seat}</td>
                  <td className="name-cell">
                    <i style={{ background: item.color }} />
                    {item.name}
                  </td>
                  <td>{formatNumber(item.peakForce)}</td>
                  <td>{formatNumber(item.averageForce)}</td>
                  <td>{formatNumber(item.impulse)}</td>
                  <td>{item.driveTime.toFixed(2)}</td>
                  <td>{item.speedKmh.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>
        {value}
        {hint && <small>{hint}</small>}
      </strong>
    </div>
  );
}

function Legend({ items }: { items: Array<{ label: string; swatch: "line" | "dashed" | "range"; color?: string }> }) {
  return (
    <ul className="legend">
      {items.map((item) => (
        <li key={item.label}>
          <i className={item.swatch} style={item.color ? { background: item.color, color: item.color } : undefined} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function Tabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (id: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {options.map((option) => (
        <button key={option.id} type="button" role="tab" aria-selected={value === option.id} onClick={() => onChange(option.id)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function InfoTip({ text }: { text: string }) {
  return (
    <button className="info-tip" type="button" title={text} aria-label={text}>
      i
    </button>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 12 8" aria-hidden="true" className="chevron">
      <path d="M1 1.5 6 6.5 11 1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PennMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="crest">
      <path d="M12 2.2 20 5.4v6.2c0 4.5-3.1 8-8 10.2-4.9-2.2-8-5.7-8-10.2V5.4L12 2.2Z" fill="#011F5B" />
      <path d="M12 7.2 7.8 9v2.8c0 2.2 1.6 4 4.2 5.1 2.6-1.1 4.2-2.9 4.2-5.1V9L12 7.2Z" fill="#fff" />
      <path d="M12 9.2 9.4 10.4v1.8c0 1.3 1 2.3 2.6 3 1.6-.7 2.6-1.7 2.6-3v-1.8L12 9.2Z" fill="#011F5B" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M5 3.5h2v9H5v-9Zm4 0h2v9H9v-9Z" fill="currentColor" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6 4.2v7.6L12.2 8 6 4.2Z" fill="currentColor" />
    </svg>
  );
}

function Bulb() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="bulb">
      <path
        d="M8 1.6a4.2 4.2 0 0 0-2.3 7.7c.3.2.5.6.5 1v.4h3.6v-.4c0-.4.2-.8.5-1A4.2 4.2 0 0 0 8 1.6ZM6.4 12.2h3.2v.7a1.6 1.6 0 0 1-3.2 0v-.7Z"
        fill="currentColor"
      />
    </svg>
  );
}

function InsightMark({ tone }: { tone: InsightTone }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="mark">
      {tone === "good" ? (
        <path d="M3.2 8.3 6.3 11.4 12.8 4.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      ) : tone === "warn" ? (
        <path d="M8 3.2 13 13H3L8 3.2Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      ) : (
        <>
          <circle cx="8" cy="8" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M8 7.2V11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="8" cy="5.2" r="0.7" fill="currentColor" />
        </>
      )}
    </svg>
  );
}
