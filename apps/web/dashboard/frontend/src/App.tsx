import { useEffect, useMemo, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { initialsFromEmail, useAuth, type Account } from "./auth";
import { AuthFrame, DocView, SiteFooter, type DocId } from "./legal";
import { ForceCurveChart, OarlockChart, PeakBarChart, PowerChart, selectionCurve, seriesPeak, sessionCurve, type SensorSample } from "./charts";
import {
  ATHLETES,
  PAST_SESSIONS,
  SESSION,
  crewPeak,
  formatNumber,
  insightsFor,
  rosterFor,
  type Athlete,
  type InsightTone,
} from "./data";

type Page = "dashboard" | "live" | "analytics" | "team" | "profile" | "settings";
type OarMode = "oarlock" | "footboard";

const PAGES: Array<{ id: Page; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "live", label: "View" },
  { id: "analytics", label: "Analytics" },
];

export function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [boatId, setBoatId] = useState("");
  const [selectedId, setSelectedId] = useState("ethan");
  const [oarMode, setOarMode] = useState<OarMode>("oarlock");
  const [activeSessionId, setActiveSessionId] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [teamCode, setTeamCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);
  const [teamScreen, setTeamScreen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamLocation, setTeamLocation] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [doc, setDoc] = useState<DocId | null>(null);
  const { userId, email, username, role, team, logout, joinTeam, createTeam, applyAccount } = useAuth();
  const initials = initialsFromEmail(username || email);

  const mySessions = useMySessions(userId);

  useEffect(() => {
    if (mySessions.some((session) => session.sessionId === activeSessionId)) {
      return;
    }
    const preferred = mySessions.find((session) => session.id === "now") ?? mySessions[0];
    setActiveSessionId(preferred?.sessionId ?? "");
  }, [activeSessionId, mySessions]);
  const [teamBoats, setTeamBoats] = useTeamBoats(userId);
  const selectedBoat = teamBoats.find((item) => item.id === boatId) ?? teamBoats[0];
  const analyticsRoster = rosterFor(seatsFor(selectedBoat?.shellType));
  const lineup = [...(selectedBoat?.seats ?? [])].sort((a, b) => b.number - a.number);
  const chartRoster = lineup.map((seat) => viewAthlete(seat));
  const self = { ...(ATHLETES.find((item) => item.id === "ethan") ?? ATHLETES[0]), id: userId, name: accountName(email) };
  const athlete = role === "athlete" ? self : (chartRoster.find((item) => item.id === selectedId) ?? chartRoster[0] ?? self);
  const monitoring = page === "live";
  const navPages = role === "coach" ? [...PAGES, { id: "team" as const, label: "Team" }] : PAGES;

  useEffect(() => {
    if (teamBoats.length > 0 && !teamBoats.some((item) => item.id === boatId)) {
      setBoatId(teamBoats[0].id);
    }
  }, [boatId, teamBoats]);

  useEffect(() => {
    if (role !== "coach") {
      return;
    }
    const numbers = selectedBoat?.seats.map((seat) => seat.number) ?? [];
    if (numbers.length === 0 || numbers.some((number) => String(number) === selectedId)) {
      return;
    }
    setSelectedId(String(Math.max(...numbers)));
  }, [role, selectedBoat?.seats, selectedId]);

  function closeMenus() {
    setProfileOpen(false);
  }

  function openPage(next: Page) {
    closeMenus();
    setTeamScreen(false);
    setDoc(null);
    setPage(next);
  }

  function openDoc(next: DocId) {
    closeMenus();
    setTeamScreen(false);
    setDoc(next);
  }

  async function renameSeat(boatIdToUpdate: string, seat: number, name: string) {
    if (!boatIdToUpdate) {
      return;
    }
    const response = await fetch(`/api/boats/${boatIdToUpdate}/seats`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seat, name }),
    });
    const body = (await response.json()) as { seats?: BoatSeat[]; error?: string };
    if (!response.ok) {
      throw new Error(body.error ?? "Could not rename that seat.");
    }
    setTeamBoats((current) =>
      current.map((boat) => (boat.id === boatIdToUpdate ? { ...boat, seats: normalizeSeats(boat.shellType, body.seats) } : boat)),
    );
  }

  async function submitTeamCode(event: FormEvent) {
    event.preventDefault();
    setJoinError("");
    setJoining(true);
    try {
      await joinTeam(teamCode);
      setTeamCode("");
    } catch (caught) {
      setJoinError(caught instanceof Error ? caught.message : "Could not join that team.");
    } finally {
      setJoining(false);
    }
  }

  async function submitTeam(event: FormEvent) {
    event.preventDefault();
    setCreateError("");
    setCreating(true);
    try {
      await createTeam({ name: teamName, location: teamLocation });
      setTeamName("");
      setTeamLocation("");
    } catch (caught) {
      setCreateError(caught instanceof Error ? caught.message : "Could not create that team.");
    } finally {
      setCreating(false);
    }
  }

  if (!doc && role === "athlete" && !team) {
    return (
      <AuthFrame>
        <form className="join-card" onSubmit={(event) => void submitTeamCode(event)}>
          <img className="auth-logo" src="/impulse-logo.png?v=2" alt="Impulse" />
          <h1>Join a team</h1>
          <p>Ask a coach or a captain for the 4 digit access code.</p>
          {joinError && (
            <p className="auth-error" role="alert">
              {joinError}
            </p>
          )}
          <label className="auth-field">
            <span>Access code</span>
            <input
              value={teamCode}
              onChange={(event) => setTeamCode(event.target.value.toUpperCase())}
              autoComplete="off"
              maxLength={4}
              required
            />
          </label>
          <button className={joining ? "auth-submit busy" : "auth-submit"} type="submit" disabled={joining}>
            {joining ? "Joining" : "Join team"}
          </button>
          <button className="ghost" type="button" onClick={() => void logout()}>
            Log out
          </button>
        </form>
      </AuthFrame>
    );
  }

  if (!doc && role === "coach" && !team) {
    return (
      <AuthFrame>
        <form className="join-card" onSubmit={(event) => void submitTeam(event)}>
          <img className="auth-logo" src="/impulse-logo.png?v=2" alt="Impulse" />
          <h1>Create a team</h1>
          <p>Add the team details. A 4-character code is assigned when the team is saved.</p>
          {createError && (
            <p className="auth-error" role="alert">
              {createError}
            </p>
          )}
          <label className="auth-field">
            <span>Team name</span>
            <input value={teamName} onChange={(event) => setTeamName(event.target.value)} required />
          </label>
          <label className="auth-field">
            <span>Location</span>
            <input
              value={teamLocation}
              onChange={(event) => setTeamLocation(event.target.value)}
              placeholder="City or boathouse"
            />
          </label>
          <button className={creating ? "auth-submit busy" : "auth-submit"} type="submit" disabled={creating}>
            {creating ? "Creating team" : "Create team"}
          </button>
          <button className="ghost" type="button" onClick={() => void logout()}>
            Log out
          </button>
        </form>
      </AuthFrame>
    );
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="top-start">
          <button className="brand" type="button" aria-label="Impulse" onClick={() => openPage("dashboard")}>
            <img src="/impulse-logo.png?v=2" alt="Impulse" />
          </button>
          <nav className="nav" aria-label="Primary">
            {navPages.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={!teamScreen && !doc && page === item.id ? "page" : undefined}
                onClick={() => openPage(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="top-actions">
          {role === "athlete" && team && <span className="team team-name">{team.name || "Team"}</span>}
          {role === "coach" && (
            <button
              className="team"
              type="button"
              onClick={() => {
                closeMenus();
                setTeamScreen(true);
              }}
            >
              <span className="join-plus" aria-hidden="true">+</span>
              <span>{team?.name || team?.code || "Create Team"}</span>
            </button>
          )}
          <div className="menu-wrap">
            <button
              className="profile"
              type="button"
              aria-label="Account"
              aria-expanded={profileOpen}
              onClick={() => {
                setProfileOpen((open) => !open);
              }}
            >
              <span className="avatar">{initials}</span>
            </button>
            {profileOpen && (
              <div className="menu profile-menu" role="menu">
                <div className="profile-card">
                  <span className="avatar">{initials}</span>
                  <div>
                    <strong>{username || email}</strong>
                    {username && <small>{email}</small>}
                  </div>
                </div>
                <button className="menu-item" type="button" role="menuitem" onClick={() => openPage("profile")}>
                  Profile
                </button>
                <button className="menu-item" type="button" role="menuitem" onClick={() => openPage("settings")}>
                  Settings
                </button>
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
      {profileOpen && <button className="backdrop" type="button" aria-label="Close menu" onClick={closeMenus} />}
      {doc ? (
        <DocView id={doc} signedIn onOpen={openDoc} />
      ) : teamScreen && role === "coach" ? (
        <main className="team-screen">
          {team ? (
            <section className="team-form">
              <h1>{team.name}</h1>
              {team.location && <p className="auth-lead">{team.location}</p>}
              <p className="auth-lead">Athletes join with this code.</p>
              <p className="team-code">{team.code}</p>
              <button className="auth-submit" type="button" onClick={() => setTeamScreen(false)}>
                Back to dashboard
              </button>
            </section>
          ) : (
            <form className="team-form" onSubmit={(event) => void submitTeam(event)}>
              <h1>Create a team</h1>
              <p className="auth-lead">Add the team details. A 4-character code is assigned when the team is saved.</p>
              {createError && (
                <p className="auth-error" role="alert">
                  {createError}
                </p>
              )}
              <label className="auth-field">
                <span>Team name</span>
                <input value={teamName} onChange={(event) => setTeamName(event.target.value)} required />
              </label>
              <label className="auth-field">
                <span>Location</span>
                <input
                  value={teamLocation}
                  onChange={(event) => setTeamLocation(event.target.value)}
                  placeholder="City or boathouse"
                />
              </label>
              <div className="team-actions">
                <button className="ghost" type="button" onClick={() => setTeamScreen(false)}>
                  Cancel
                </button>
                <button className={creating ? "auth-submit busy" : "auth-submit"} type="submit" disabled={creating}>
                  {creating ? "Creating team" : "Create team"}
                </button>
              </div>
            </form>
          )}
        </main>
      ) : page === "dashboard" ? (
        team ? (
          <HomeView
            role={role === "coach" ? "coach" : "athlete"}
            sessions={mySessions}
            boats={teamBoats}
            setBoats={setTeamBoats}
            onOpenSession={(sessionId) => {
              setActiveSessionId(sessionId);
              openPage("live");
            }}
          />
        ) : (
          <main className="blank-dashboard" />
        )
      ) : page === "profile" ? (
        <ProfilePage onAccount={applyAccount} />
      ) : page === "settings" ? (
        <SettingsPage />
      ) : page === "team" && role === "coach" ? (
        <TeamPage />
      ) : (
      <div className={monitoring ? "body wide view-fit" : "body wide"}>
        <Sidebar
          boats={teamBoats}
          boatId={selectedBoat?.id ?? ""}
          seats={lineup}
          selectedId={selectedId}
          personal={role === "athlete"}
          onBoat={setBoatId}
          onSelect={setSelectedId}
          onRenameSeat={(seat, name) => renameSeat(selectedBoat?.id ?? "", seat, name)}
        />
        <main className="stage">
          {monitoring ? (
            <LiveBoard
              athlete={athlete}
              roster={chartRoster}
              boat={selectedBoat ? `${selectedBoat.name} · ${selectedBoat.shellType}` : "No boat"}
              personal={role === "athlete"}
              sessionId={activeSessionId}
              oarMode={oarMode}
              onOar={setOarMode}
            />
          ) : (
            <AnalyticsPage roster={analyticsRoster} athlete={role === "athlete" ? athlete : undefined} />
          )}
        </main>
      </div>
      )}
      <SiteFooter current={doc} onOpen={openDoc} />
    </div>
  );
}

const SHELL_TYPES = ["8+", "4+", "4-", "2-"] as const;
type ShellType = (typeof SHELL_TYPES)[number];
type BoatSeat = { number: number; name: string };
type Boat = { id: string; name: string; coachId: string; shellType: ShellType; notes: string; seats: BoatSeat[] };
type BoatDraft = { id: string | null; name: string; shellType: ShellType; notes: string };

function seatsFor(shell: string | undefined) {
  if (shell === "4+" || shell === "4-") {
    return 4;
  }
  if (shell === "2-") {
    return 2;
  }
  return 8;
}

function isShellType(value: string): value is ShellType {
  return (SHELL_TYPES as readonly string[]).includes(value);
}

function seatMark(number: number, count: number) {
  if (number === count) {
    return "Stroke";
  }
  if (number === 1) {
    return "Bow";
  }
  return String(number);
}

function normalizeSeats(shellType: ShellType, seats: unknown): BoatSeat[] {
  const count = seatsFor(shellType);
  const incoming = Array.isArray(seats)
    ? seats.flatMap((seat) => {
        if (!seat || typeof seat !== "object") {
          return [];
        }
        const number = Number((seat as { number?: unknown }).number);
        const name = String((seat as { name?: unknown }).name ?? "");
        if (!Number.isInteger(number) || number < 1 || number > count) {
          return [];
        }
        return [{ number, name }];
      })
    : [];
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    return incoming.find((seat) => seat.number === number) ?? { number, name: "" };
  });
}

function viewAthlete(seat: BoatSeat): Athlete {
  const template = ATHLETES.find((item) => item.seat === seat.number) ?? ATHLETES[0];
  return {
    ...template,
    id: String(seat.number),
    seat: seat.number,
    name: seat.name.trim() || "Empty",
    detail: "",
  };
}
type PastSession = (typeof PAST_SESSIONS)[number];
type LinkedSession = PastSession & { sessionId: string };
type TeamAthlete = { id: string; email: string; username: string | null };

function accountName(email: string) {
  return email.split("@")[0] || email;
}

function normalizeBoat(boat: { id: string; name: string; coachId: string; shellType?: string; notes?: string; seats?: unknown }): Boat {
  const shellType = boat.shellType && isShellType(boat.shellType) ? boat.shellType : "8+";
  return {
    id: boat.id,
    name: boat.name,
    coachId: boat.coachId,
    shellType,
    notes: boat.notes ?? "",
    seats: normalizeSeats(shellType, boat.seats),
  };
}

function useTeamBoats(userId: string): [Boat[], Dispatch<SetStateAction<Boat[]>>] {
  const [boats, setBoats] = useState<Boat[]>([]);

  useEffect(() => {
    let active = true;
    fetch("/api/boats")
      .then(async (response) => {
        if (!response.ok) {
          return { boats: [] as Boat[] };
        }
        return (await response.json()) as { boats: Array<Omit<Boat, "shellType" | "seats"> & { shellType?: string; seats?: unknown }> };
      })
      .then((body) => {
        if (active) {
          setBoats(body.boats.map(normalizeBoat));
        }
      })
      .catch(() => {
        if (active) {
          setBoats([]);
        }
      });
    return () => {
      active = false;
    };
  }, [userId]);

  return [boats, setBoats];
}

function useMySessions(userId: string) {
  const [sessions, setSessions] = useState<LinkedSession[]>([]);

  useEffect(() => {
    let active = true;
    fetch("/api/practice-sessions")
      .then(async (response) => {
        if (!response.ok) {
          return { sessions: [] as Array<{ id: string; mockId: string }> };
        }
        return (await response.json()) as { sessions: Array<{ id: string; mockId: string }> };
      })
      .then((body) => {
        if (!active) {
          return;
        }
        const ids = new Map(body.sessions.map((session) => [session.mockId, session.id]));
        setSessions(
          PAST_SESSIONS.flatMap((session) => {
            const sessionId = ids.get(session.id);
            return sessionId ? [{ ...session, sessionId }] : [];
          }),
        );
      })
      .catch(() => {
        if (active) {
          setSessions([]);
        }
      });
    return () => {
      active = false;
    };
  }, [userId]);

  return sessions;
}

function sessionDate(when: string) {
  const today = new Date();
  if (when.startsWith("Today")) {
    return today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  }
  if (when.startsWith("Yesterday")) {
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    return yesterday.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  }
  return when;
}

function sessionSummary(distance: string, meta: string) {
  const meters = distance.match(/^([\d,]+)\s*m$/i);
  const kilometers = distance.match(/^([\d.]+)\s*km$/i);
  const label = meters
    ? `${(Number(meters[1].replaceAll(",", "")) / 1000).toFixed(1)}KM`
    : kilometers
      ? `${kilometers[1]}KM`
      : distance;
  const minutes = meta.match(/\d+/);
  return `${label} | ${minutes?.[0] ?? meta}:00 Duration`;
}

function HomeView({
  role,
  sessions,
  boats,
  setBoats,
  onOpenSession,
}: {
  role: "athlete" | "coach";
  sessions: LinkedSession[];
  boats: Boat[];
  setBoats: Dispatch<SetStateAction<Boat[]>>;
  onOpenSession: (sessionId: string) => void;
}) {
  const [boatError, setBoatError] = useState("");
  const [savingBoat, setSavingBoat] = useState(false);
  const [menuBoatId, setMenuBoatId] = useState<string | null>(null);
  const [editor, setEditor] = useState<BoatDraft | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = boats.find((boat) => boat.id === detailId);

  async function saveBoat(event: FormEvent) {
    event.preventDefault();
    if (!editor) {
      return;
    }
    setBoatError("");
    setSavingBoat(true);
    try {
      const response = await fetch(editor.id ? `/api/boats/${editor.id}` : "/api/boats", {
        method: editor.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editor.name, shellType: editor.shellType, notes: editor.notes }),
      });
      const body = (await response.json()) as (Boat & { error?: string; shellType?: string }) | { error?: string };
      if (!response.ok || !("id" in body)) {
        throw new Error(("error" in body && body.error) || "Could not save that boat.");
      }
      const saved = normalizeBoat(body);
      setBoats((current) => (editor.id ? current.map((boat) => (boat.id === saved.id ? saved : boat)) : [...current, saved]));
      setEditor(null);
    } catch (caught) {
      setBoatError(caught instanceof Error ? caught.message : "Could not save that boat.");
    } finally {
      setSavingBoat(false);
    }
  }

  async function deleteBoat(id: string) {
    setBoatError("");
    setMenuBoatId(null);
    const response = await fetch(`/api/boats/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setBoatError(body.error ?? "Could not delete that boat.");
      return;
    }
    setBoats((current) => current.filter((boat) => boat.id !== id));
    if (detailId === id) {
      setDetailId(null);
    }
    if (editor?.id === id) {
      setEditor(null);
    }
  }

  function openEditor(boat?: Boat) {
    setMenuBoatId(null);
    setDetailId(null);
    setBoatError("");
    setEditor(
      boat
        ? { id: boat.id, name: boat.name, shellType: boat.shellType, notes: boat.notes }
        : { id: null, name: "", shellType: "8+", notes: "" },
    );
  }

  return (
    <main className="home">
      <section className="home-section">
        <h2>Recent Sessions</h2>
        <hr />
        {sessions.length > 0 ? (
          <div className="tile-row">
            {sessions.map((item) => (
              <button
                key={item.id}
                className="home-tile"
                type="button"
                onClick={() => onOpenSession(item.sessionId)}
              >
                <span className="tile-date">{sessionDate(item.when)}</span>
                <span className="tile-caption">{sessionSummary(item.distance, item.meta)}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="session-empty">No sessions are linked to this account yet.</p>
        )}
      </section>
      {role === "coach" && (
        <section className="home-section">
          <h2>Boat View</h2>
          <hr />
          {boatError && (
            <p className="auth-error" role="alert">
              {boatError}
            </p>
          )}
          <div className="tile-row">
            {boats.map((boat) => (
              <div className={menuBoatId === boat.id ? "home-tile menu-open" : "home-tile"} key={boat.id}>
                <button
                  className="boat-open"
                  type="button"
                  aria-label={`Details for ${boat.name}`}
                  onClick={() => setDetailId(boat.id)}
                />
                <button
                  className="boat-more"
                  type="button"
                  aria-label={`Options for ${boat.name}`}
                  aria-expanded={menuBoatId === boat.id}
                  onClick={() => setMenuBoatId((current) => (current === boat.id ? null : boat.id))}
                >
                  ···
                </button>
                {menuBoatId === boat.id && (
                  <div className="boat-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => openEditor(boat)}>
                      Edit
                    </button>
                    <button type="button" role="menuitem" onClick={() => void deleteBoat(boat.id)}>
                      Delete
                    </button>
                  </div>
                )}
                <span className="tile-label">{boat.name}</span>
              </div>
            ))}
            <button className="home-tile add-boat" type="button" onClick={() => openEditor()}>
              <span className="add-boat-plus">+</span>
              <span className="tile-label">Add a Boat</span>
            </button>
          </div>
          {menuBoatId && (
            <button className="boat-menu-backdrop" type="button" aria-label="Close boat menu" onClick={() => setMenuBoatId(null)} />
          )}
          {detail && <BoatDetail boat={detail} onClose={() => setDetailId(null)} onEdit={() => openEditor(detail)} />}
          {editor && (
            <form className="boat-dialog" onSubmit={(event) => void saveBoat(event)}>
              <button className="boat-dialog-backdrop" type="button" aria-label="Close" onClick={() => setEditor(null)} />
              <div className="boat-dialog-card">
                <h3>{editor.id ? "Edit boat" : "Add a boat"}</h3>
                {boatError && (
                  <p className="auth-error" role="alert">
                    {boatError}
                  </p>
                )}
                <label>
                  <span>Boat name</span>
                  <input
                    value={editor.name}
                    onChange={(event) => setEditor({ ...editor, name: event.target.value })}
                    maxLength={80}
                    required
                    autoFocus
                  />
                </label>
                <label>
                  <span>Type of boat</span>
                  <select
                    value={editor.shellType}
                    onChange={(event) => {
                      const shellType = event.target.value;
                      if (isShellType(shellType)) {
                        setEditor({ ...editor, shellType });
                      }
                    }}
                  >
                    {SHELL_TYPES.map((shell) => (
                      <option key={shell} value={shell}>
                        {shell}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Notes</span>
                  <textarea
                    value={editor.notes}
                    onChange={(event) => setEditor({ ...editor, notes: event.target.value })}
                    maxLength={500}
                    placeholder="Optional notes about this boat"
                  />
                </label>
                <div className="boat-form-actions">
                  <button className="ghost" type="button" onClick={() => setEditor(null)}>
                    Cancel
                  </button>
                  <button type="submit" disabled={savingBoat}>
                    {savingBoat ? "Saving" : "Save"}
                  </button>
                </div>
              </div>
            </form>
          )}
        </section>
      )}
    </main>
  );
}

function BoatDetail({ boat, onClose, onEdit }: { boat: Boat; onClose: () => void; onEdit: () => void }) {
  return (
    <div className="boat-dialog">
      <button className="boat-dialog-backdrop" type="button" aria-label="Close boat details" onClick={onClose} />
      <div className="boat-dialog-card" role="dialog" aria-labelledby="boat-detail-title">
        <h3 id="boat-detail-title">{boat.name}</h3>
        <dl className="boat-detail">
          <div>
            <dt>Type of boat</dt>
            <dd>{boat.shellType}</dd>
          </div>
          <div>
            <dt>Notes</dt>
            <dd>{boat.notes || "No notes yet."}</dd>
          </div>
        </dl>
        <div className="boat-form-actions">
          <button className="ghost" type="button" onClick={onClose}>
            Close
          </button>
          <button className="boat-primary" type="button" onClick={onEdit}>
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}

function Sidebar({
  boats,
  boatId,
  seats,
  selectedId,
  personal,
  onBoat,
  onSelect,
  onRenameSeat,
}: {
  boats: Boat[];
  boatId: string;
  seats: BoatSeat[];
  selectedId: string;
  personal: boolean;
  onBoat: (boatId: string) => void;
  onSelect: (id: string) => void;
  onRenameSeat: (seat: number, name: string) => Promise<void>;
}) {
  const [rename, setRename] = useState<{ number: number; name: string; x: number; y: number; error: string } | null>(null);
  const [savingName, setSavingName] = useState(false);

  async function saveName(event: FormEvent) {
    event.preventDefault();
    if (!rename) {
      return;
    }
    setSavingName(true);
    try {
      await onRenameSeat(rename.number, rename.name);
      setRename(null);
    } catch (caught) {
      setRename({ ...rename, error: caught instanceof Error ? caught.message : "Could not rename that seat." });
    } finally {
      setSavingName(false);
    }
  }

  return (
    <aside className="sidebar">
      <label className="field">
        <span>Boat</span>
        <select value={boatId} onChange={(event) => onBoat(event.target.value)} disabled={boats.length === 0}>
          {boats.length === 0 ? (
            <option value="">No boats yet</option>
          ) : (
            boats.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))
          )}
        </select>
      </label>
      {!personal && <div className="athlete-list">
        {seats.map((seat) => {
          const selected = String(seat.number) === selectedId;
          const label = seatMark(seat.number, seats.length);
          return (
            <button
              key={seat.number}
              type="button"
              className={selected ? "athlete selected" : "athlete"}
              aria-pressed={selected}
              aria-label={`${label}${seat.name ? `, ${seat.name}` : ", empty"}. Right-click to rename.`}
              onClick={() => onSelect(String(seat.number))}
              onContextMenu={(event) => {
                event.preventDefault();
                setRename({ number: seat.number, name: seat.name, x: event.clientX, y: event.clientY, error: "" });
              }}
            >
              <span className="seat-no">{label}</span>
              <span className={seat.name ? "athlete-name" : "athlete-name empty"}>{seat.name || "Empty"}</span>
            </button>
          );
        })}
      </div>}
      {!personal && <BoatMap seats={seats} selectedId={selectedId} onSelect={onSelect} />}
      {rename && (
        <form
          className="seat-rename"
          style={{ left: Math.min(rename.x, window.innerWidth - 240), top: Math.min(rename.y, window.innerHeight - 160) }}
          onSubmit={(event) => void saveName(event)}
        >
          <p>Rename rower</p>
          {rename.error && (
            <p className="auth-error" role="alert">
              {rename.error}
            </p>
          )}
          <input
            value={rename.name}
            onChange={(event) => setRename({ ...rename, name: event.target.value })}
            maxLength={80}
            placeholder="Rower name"
            autoFocus
            aria-label="Rower name"
          />
          <div className="boat-form-actions">
            <button className="ghost" type="button" onClick={() => setRename(null)}>
              Cancel
            </button>
            <button type="submit" disabled={savingName}>
              {savingName ? "Saving" : "Save"}
            </button>
          </div>
        </form>
      )}
      <SeatChat />
    </aside>
  );
}

function BoatMap({
  seats,
  selectedId,
  onSelect,
}: {
  seats: BoatSeat[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const count = seats.length;
  return (
    <svg className="boat" viewBox="0 0 240 78" role="img" aria-label="Boat seats">
      <path
        d="M14 40 C14 29 28 24 42 24 H178 C202 24 218 31 230 40 C218 49 202 56 178 56 H42 C28 56 14 51 14 40 Z"
        fill="#eef3f8"
        stroke="#d5deea"
      />
      <path d="M46 40 H196" stroke="#d5deea" strokeWidth="1" />
      <path d="M230 40 H236" stroke="#9aabbd" strokeWidth="2" strokeLinecap="round" />
      {seats.map((seat, index) => {
        const x = count === 1 ? 120 : 40 + index * (156 / (count - 1));
        const selected = String(seat.number) === selectedId;
        const label = count === 2 ? seatMark(seat.number, count) : String(seat.number);
        return (
          <g key={seat.number} className="boat-seat" onClick={() => onSelect(String(seat.number))}>
            <circle cx={x} cy={40} r={selected ? 8 : 6.5} fill={selected ? "#2f6bff" : "#c5ced8"} />
            <text x={x} y={70} textAnchor="middle" fontSize="10" fill="#7b8798">
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function useBoxHeight() {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(160);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    const update = () => setHeight(Math.max(96, Math.floor(node.clientHeight)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, height] as const;
}

function clock(second: number) {
  const total = Math.max(0, Math.round(second));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function LiveBoard({
  athlete,
  roster,
  boat,
  personal,
  sessionId,
  oarMode,
  onOar,
}: {
  athlete: Athlete;
  roster: Athlete[];
  boat: string;
  personal: boolean;
  sessionId: string;
  oarMode: OarMode;
  onOar: (mode: OarMode) => void;
}) {
  const [points, setPoints] = useState<Array<[number, number]> | null>(null);
  const [samples, setSamples] = useState<SensorSample[]>([]);
  const [range, setRange] = useState({ start: 0, end: 0 });
  const [powerRef, powerHeight] = useBoxHeight();
  const [forceRef, forceHeight] = useBoxHeight();
  const [oarRef, oarHeight] = useBoxHeight();

  useEffect(() => {
    if (!sessionId) {
      setPoints([]);
      setSamples([]);
      return;
    }
    setPoints(null);
    let active = true;
    fetch(`/api/telemetry?sessionId=${sessionId}`)
      .then(async (response) => {
        if (!response.ok) {
          return { points: [] as Array<[number, number]> };
        }
        return (await response.json()) as { points: Array<[number, number]>; samples?: SensorSample[] };
      })
      .then((body) => {
        if (active) {
          setPoints(body.points ?? []);
          setSamples(body.samples ?? []);
        }
      })
      .catch(() => {
        if (active) {
          setPoints([]);
          setSamples([]);
        }
      });
    return () => {
      active = false;
    };
  }, [sessionId]);

  useEffect(() => {
    setRange({ start: 0, end: Math.max(0, (points?.length ?? 0) - 1) });
  }, [points]);

  const series = points ?? [];
  const slice = series.slice(range.start, range.end + 1);
  const average = slice.length === 0 ? 0 : Math.round(slice.reduce((sum, point) => sum + point[1], 0) / slice.length);
  const startPoint = series[range.start] ?? [0, 0];
  const endPoint = series[range.end] ?? startPoint;
  const single = range.start === range.end;
  const windowLabel = points === null
    ? "Loading"
    : series.length === 0
      ? "No sensor data"
      : single
        ? `${clock(startPoint[0])} · ${formatNumber(startPoint[1])} W`
        : `${clock(startPoint[0])}–${clock(endPoint[0])} · ${formatNumber(average)} W avg`;
  const subject = personal ? athlete.name : athlete.name === "Empty" ? seatMark(athlete.seat, roster.length) : `${seatMark(athlete.seat, roster.length)} — ${athlete.name}`;
  const forceAverage = useMemo(() => sessionCurve(samples, "force"), [samples]);
  const footboardAverage = useMemo(() => sessionCurve(samples, "footboard"), [samples]);
  const forceCurrent = useMemo(
    () => (samples.length === 0 ? forceAverage : selectionCurve(samples, startPoint[0], endPoint[0], "force")),
    [endPoint, forceAverage, samples, startPoint],
  );
  const footboardCurrent = useMemo(
    () => (samples.length === 0 ? footboardAverage : selectionCurve(samples, startPoint[0], endPoint[0], "footboard")),
    [endPoint, footboardAverage, samples, startPoint],
  );
  const forceMax = Math.max(200, seriesPeak(forceAverage), seriesPeak(forceCurrent));
  const footboardMax = Math.max(200, seriesPeak(footboardAverage), seriesPeak(footboardCurrent));
  const forceY = Math.ceil((forceMax * 1.12) / 100) * 100;
  const footboardY = Math.ceil((footboardMax * 1.12) / 100) * 100;
  const lowerCurrent = oarMode === "footboard" ? footboardCurrent : forceCurrent;
  const lowerAverage = oarMode === "footboard" ? footboardAverage : forceAverage;
  const lowerY = oarMode === "footboard" ? footboardY : forceY;
  const insights = insightsFor(athlete);

  return (
    <div className="live">
      <section className="card live-card">
        <div className="card-head">
          <h2>Data</h2>
          <span className="card-sub">{boat} · {windowLabel}</span>
        </div>
        <p className="card-sub">Click a moment, or drag across the session, to update the cards below.</p>
        <div className="chart-fill" ref={powerRef}>
          {series.length > 0 ? (
            <PowerChart points={series} start={range.start} end={range.end} height={powerHeight} onPick={(start, end) => setRange({ start, end })} />
          ) : (
            <p className="card-sub">{points === null ? "Loading the session." : "No sensor data for this session."}</p>
          )}
        </div>
      </section>

      <section className="card live-card">
        <div className="card-head">
          <h2>
            Force Curve <InfoTip text="Force through the stroke for the selected time, with the crew average." />
          </h2>
            <Legend
            items={[
              { label: "Selected", swatch: "line", color: "#2f6bff" },
              { label: "Session average", swatch: "dashed" },
            ]}
          />
        </div>
        <p className="card-sub">{subject} · {windowLabel}</p>
        <div className="chart-fill" ref={forceRef}>
          <ForceCurveChart current={forceCurrent} average={forceAverage} yMax={forceY} height={forceHeight} />
        </div>
      </section>

      <div className="live-split">
        <section className="card live-card">
          <div className="card-head">
            <Tabs
              value={oarMode}
              onChange={onOar}
              options={[
                { id: "oarlock", label: "Oarlock Force" },
                { id: "footboard", label: "Footboard Force" },
              ]}
            />
          </div>
          <div className="chart-fill" ref={oarRef}>
            <OarlockChart mode={oarMode} current={lowerCurrent} average={lowerAverage} yMax={lowerY} height={oarHeight} />
          </div>
          <Legend
            items={[
              {
                label: oarMode === "footboard" ? "Footboard (selected)" : "Oarlock (selected)",
                swatch: "line",
                color: oarMode === "footboard" ? "#22a06b" : "#2f6bff",
              },
              { label: oarMode === "footboard" ? "Footboard (session)" : "Oarlock (session)", swatch: "dashed" },
            ]}
          />
        </section>
        <section className="card live-card insights">
          <h2>
            <Bulb /> Insights
          </h2>
          <p className="card-sub">{single ? `At ${clock(startPoint[0])}, power is ${formatNumber(startPoint[1])} W.` : `From ${clock(startPoint[0])} to ${clock(endPoint[0])}, power averages ${formatNumber(average)} W.`}</p>
          <ul>
            {insights.map((insight) => (
              <li key={insight.text} className={insight.tone}>
                <InsightMark tone={insight.tone} />
                <p>{insight.text}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function SeatChat() {
  const [messages, setMessages] = useState<Array<{ role: "assistant" | "user"; text: string }>>([
    { role: "assistant", text: "Ask about this session, a seat, or the boat." },
  ]);
  const [draft, setDraft] = useState("");

  function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) {
      return;
    }
    setMessages((current) => [
      ...current,
      { role: "user", text },
      { role: "assistant", text: "The coach chat will answer from this session once it is connected." },
    ]);
    setDraft("");
  }

  return (
    <section className="seat-chat">
      <h2>Chat</h2>
      <div className="chat-log">
        {messages.map((message, index) => (
          <p key={`${message.role}-${index}`} className={message.role === "user" ? "chat-bubble mine" : "chat-bubble"}>
            {message.text}
          </p>
        ))}
      </div>
      <form onSubmit={send}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Message"
          aria-label="Message"
        />
        <button type="submit">Send</button>
      </form>
    </section>
  );
}

function Metrics({ athlete, title }: { athlete: Athlete; title?: string }) {
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
        <h2>{title ?? `Key Metrics (Seat ${athlete.seat})`}</h2>
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

function displayName(member: TeamAthlete) {
  return member.username || member.email;
}

function TeamPage() {
  const [members, setMembers] = useState<TeamAthlete[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/team/athletes")
      .then(async (response) => {
        const body = (await response.json()) as { athletes?: TeamAthlete[]; error?: string };
        if (!response.ok) {
          throw new Error(body.error ?? "Could not load the team.");
        }
        return body.athletes ?? [];
      })
      .then((athletes) => {
        if (active) {
          setMembers(athletes);
        }
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Could not load the team.");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (members.length > 0 && !members.some((member) => member.id === selectedId)) {
      setSelectedId(members[0].id);
    }
  }, [members, selectedId]);

  const index = members.findIndex((member) => member.id === selectedId);
  const member = index >= 0 ? members[index] : undefined;
  const stats = member ? { ...ATHLETES[index % ATHLETES.length], id: member.id, name: displayName(member) } : undefined;

  return (
    <div className="body">
      <aside className="sidebar">
        <label className="field">
          <span>Athlete</span>
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={members.length === 0}>
            {members.length === 0 ? (
              <option value="">No athletes yet</option>
            ) : (
              members.map((item) => (
                <option key={item.id} value={item.id}>
                  {displayName(item)}
                </option>
              ))
            )}
          </select>
        </label>
        <div className="team-roster">
          {members.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === selectedId ? "team-member selected" : "team-member"}
              aria-pressed={item.id === selectedId}
              onClick={() => setSelectedId(item.id)}
            >
              <strong>{displayName(item)}</strong>
              <small>{item.email}</small>
            </button>
          ))}
        </div>
      </aside>
      <main className="stage">
        <div className="page">
          <header className="page-head">
            <h1>Team</h1>
            <p>
              {members.length === 0
                ? "No athletes have joined this team yet."
                : `${members.length} ${members.length === 1 ? "athlete has" : "athletes have"} joined.`}
            </p>
          </header>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          {stats && (
            <>
              <div className="summary">
                <Stat label="Peak force" value={`${formatNumber(stats.peakForce)} N`} />
                <Stat label="Impulse" value={`${formatNumber(stats.impulse)} N·s`} />
                <Stat label="Drive time" value={`${stats.driveTime.toFixed(2)} s`} />
                <Stat label="Boat speed" value={`${stats.boatSpeed.toFixed(1)} m/s`} />
              </div>
              <section className="card">
                <div className="card-head">
                  <h2>{stats.name}</h2>
                </div>
                <PeakBarChart athletes={[stats]} />
              </section>
            </>
          )}
        </div>
      </main>
      {stats && <Metrics athlete={stats} title={`${stats.name}`} />}
    </div>
  );
}

function AnalyticsPage({ roster, athlete }: { roster: Athlete[]; athlete?: Athlete }) {
  const lineup = athlete ? [athlete] : roster;
  const peak = crewPeak(lineup);
  const impulse = Math.round(lineup.reduce((sum, item) => sum + item.impulse, 0) / lineup.length);
  const drive = lineup.reduce((sum, item) => sum + item.driveTime, 0) / lineup.length;
  return (
    <div className="page">
      <header className="page-head">
        <h1>Analytics</h1>
        <p>{athlete ? `Your analytics, ${athlete.name}.` : `Crew averages for ${SESSION.team} across the current lineup.`}</p>
      </header>
      <div className="summary">
        <Stat label="Avg peak force" value={`${formatNumber(peak)} N`} />
        <Stat label="Avg impulse" value={`${formatNumber(impulse)} N·s`} />
        <Stat label="Avg drive time" value={`${drive.toFixed(2)} s`} />
        <Stat label="Boat speed" value={`${SESSION.boatSpeed.toFixed(1)} m/s`} />
      </div>
      <section className="card">
        <div className="card-head">
          <h2>{athlete ? athlete.name : "Peak force by seat"}</h2>
        </div>
        <PeakBarChart athletes={lineup} />
      </section>
      <section className="card table-card">
        <div className="table-wrap">
          <table className="strokes">
            <thead>
              <tr>
                {!athlete && <th>Seat</th>}
                <th>Athlete</th>
                <th>Peak Force (N)</th>
                <th>Avg Force (N)</th>
                <th>Impulse (N·s)</th>
                <th>Drive (s)</th>
                <th>Speed (km/h)</th>
              </tr>
            </thead>
            <tbody>
              {lineup.map((item) => (
                <tr key={item.id}>
                  {!athlete && <td>{item.seat}</td>}
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

type ProfileRecord = {
  email: string;
  username: string | null;
  role: "athlete" | "coach" | null;
  provider: string;
  hasPassword: boolean;
  memberSince: string | null;
  team: { name: string | null; location: string | null } | null;
  stats: {
    sessions: number;
    meters: number;
    durationS: number;
    strokes: number;
    avgPowerW: number;
    maxPowerW: number;
  };
};

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours === 0) {
    return `${minutes} min`;
  }
  return `${hours}h ${minutes}m`;
}

function formatDistance(meters: number, unit: "meters" | "kilometers") {
  if (unit === "kilometers") {
    return `${(meters / 1000).toFixed(meters >= 10000 ? 1 : 2)} km`;
  }
  return `${formatNumber(meters)} m`;
}

function ProfilePage({ onAccount }: { onAccount: (account: Account) => void }) {
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [unit, setUnit] = useState<"meters" | "kilometers">("meters");
  const [username, setUsername] = useState("");
  const [usernameNote, setUsernameNote] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordNote, setPasswordNote] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/profile").then(async (response) => (response.ok ? ((await response.json()) as ProfileRecord) : null)),
      fetch("/api/settings").then(async (response) =>
        response.ok ? ((await response.json()) as { distanceUnit?: "meters" | "kilometers" }) : null,
      ),
    ])
      .then(([body, settings]) => {
        if (!active || !body) {
          return;
        }
        setProfile(body);
        setUsername(body.username ?? "");
        if (settings?.distanceUnit === "kilometers") {
          setUnit("kilometers");
        }
      })
      .catch(() => {
        if (active) {
          setProfile(null);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function saveUsername(event: FormEvent) {
    event.preventDefault();
    setUsernameError("");
    setUsernameNote("");
    setSavingName(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const body = (await response.json()) as Account & { error?: string };
      if (!response.ok) {
        setUsernameError(body.error ?? "Could not save that username.");
        return;
      }
      onAccount(body);
      setUsername(body.username ?? "");
      setProfile((current) => (current ? { ...current, username: body.username } : current));
      setUsernameNote("Username saved.");
    } catch {
      setUsernameError("Could not save that username.");
    } finally {
      setSavingName(false);
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError("");
    setPasswordNote("");
    if (nextPassword !== confirmPassword) {
      setPasswordError("Those passwords do not match.");
      return;
    }
    setSavingPassword(true);
    try {
      const response = await fetch("/api/profile/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current: currentPassword, next: nextPassword }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setPasswordError(body.error ?? "Could not change that password.");
        return;
      }
      setCurrentPassword("");
      setNextPassword("");
      setConfirmPassword("");
      setPasswordNote("Password updated.");
    } catch {
      setPasswordError("Could not change that password.");
    } finally {
      setSavingPassword(false);
    }
  }

  const stats = profile?.stats;
  const memberSince = profile?.memberSince
    ? new Date(profile.memberSince).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "";

  return (
    <main className="account-page">
      <h1>Profile</h1>
      <p className="account-lead">
        {profile?.role === "coach" ? "Coach" : "Athlete"}
        {profile?.team?.name ? ` · ${profile.team.name}` : ""}
        {memberSince ? ` · Member since ${memberSince}` : ""}
      </p>
      <div className="stat-grid">
        <article className="stat-tile">
          <span>Sessions</span>
          <strong>{formatNumber(stats?.sessions ?? 0)}</strong>
        </article>
        <article className="stat-tile">
          <span>Meters rowed</span>
          <strong>{formatDistance(stats?.meters ?? 0, unit)}</strong>
        </article>
        <article className="stat-tile">
          <span>Time on the water</span>
          <strong>{formatDuration(stats?.durationS ?? 0)}</strong>
        </article>
        <article className="stat-tile">
          <span>Strokes</span>
          <strong>{formatNumber(stats?.strokes ?? 0)}</strong>
        </article>
        <article className="stat-tile">
          <span>Average power</span>
          <strong>{stats?.avgPowerW ? `${formatNumber(stats.avgPowerW)} W` : "—"}</strong>
        </article>
        <article className="stat-tile">
          <span>Best power</span>
          <strong>{stats?.maxPowerW ? `${formatNumber(stats.maxPowerW)} W` : "—"}</strong>
        </article>
      </div>
      <div className="account-grid">
        <form className="account-card" onSubmit={(event) => void saveUsername(event)}>
          <h2>Account</h2>
          <label className="auth-field">
            <span>Email</span>
            <input value={profile?.email ?? ""} readOnly />
          </label>
          <label className="auth-field">
            <span>Username</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              minLength={3}
              maxLength={24}
              required
            />
          </label>
          {usernameError && (
            <p className="auth-error" role="alert">
              {usernameError}
            </p>
          )}
          {usernameNote && <p className="account-note">{usernameNote}</p>}
          <button className={savingName ? "auth-submit busy" : "auth-submit"} type="submit" disabled={savingName}>
            {savingName ? "Saving" : "Save username"}
          </button>
        </form>
        {profile?.hasPassword ? (
          <form className="account-card" onSubmit={(event) => void savePassword(event)}>
            <h2>Password</h2>
            <label className="auth-field">
              <span>Current password</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <label className="auth-field">
              <span>New password</span>
              <input
                type="password"
                value={nextPassword}
                onChange={(event) => setNextPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            <label className="auth-field">
              <span>Confirm new password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            <p className="account-hint">At least 8 characters, with an uppercase letter and a number.</p>
            {passwordError && (
              <p className="auth-error" role="alert">
                {passwordError}
              </p>
            )}
            {passwordNote && <p className="account-note">{passwordNote}</p>}
            <button className={savingPassword ? "auth-submit busy" : "auth-submit"} type="submit" disabled={savingPassword}>
              {savingPassword ? "Saving" : "Update password"}
            </button>
          </form>
        ) : (
          <section className="account-card">
            <h2>Password</h2>
            <p className="account-hint">This account signs in with {profile?.provider === "google" ? "Google" : "an outside provider"}.</p>
          </section>
        )}
      </div>
    </main>
  );
}

type SettingsRecord = {
  distanceUnit: "meters" | "kilometers";
  sessionEmail: boolean;
  weeklySummary: boolean;
};

function SettingsPage() {
  const [settings, setSettings] = useState<SettingsRecord | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/settings")
      .then(async (response) => (response.ok ? ((await response.json()) as SettingsRecord) : null))
      .then((body) => {
        if (active && body) {
          setSettings(body);
        }
      })
      .catch(() => {
        if (active) {
          setError("Could not load settings.");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function save(next: SettingsRecord) {
    setSettings(next);
    setError("");
    setNote("");
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    if (!response.ok) {
      setError("Could not save those settings.");
      return;
    }
    setNote("Saved.");
  }

  return (
    <main className="account-page">
      <h1>Settings</h1>
      <p className="account-lead">These apply to this account.</p>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <div className="account-grid">
        <section className="account-card">
          <h2>Units</h2>
          <p className="account-hint">Distance on your profile uses this unit.</p>
          <label className="setting-choice">
            <input
              type="radio"
              name="distance-unit"
              checked={settings?.distanceUnit !== "kilometers"}
              onChange={() => settings && void save({ ...settings, distanceUnit: "meters" })}
            />
            <span>Meters</span>
          </label>
          <label className="setting-choice">
            <input
              type="radio"
              name="distance-unit"
              checked={settings?.distanceUnit === "kilometers"}
              onChange={() => settings && void save({ ...settings, distanceUnit: "kilometers" })}
            />
            <span>Kilometers</span>
          </label>
        </section>
        <section className="account-card">
          <h2>Email</h2>
          <label className="setting-choice">
            <input
              type="checkbox"
              checked={settings?.sessionEmail ?? true}
              onChange={(event) => settings && void save({ ...settings, sessionEmail: event.target.checked })}
            />
            <span>Email me when a session is saved</span>
          </label>
          <label className="setting-choice">
            <input
              type="checkbox"
              checked={settings?.weeklySummary ?? false}
              onChange={(event) => settings && void save({ ...settings, weeklySummary: event.target.checked })}
            />
            <span>Send a weekly training summary</span>
          </label>
          {note && <p className="account-note">{note}</p>}
        </section>
      </div>
    </main>
  );
}
