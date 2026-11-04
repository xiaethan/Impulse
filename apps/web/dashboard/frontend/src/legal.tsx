import { useState, type FormEvent, type ReactNode } from "react";

export type DocId =
  | "privacy"
  | "terms"
  | "help"
  | "eula"
  | "guidelines"
  | "sale"
  | "dpa"
  | "oss"
  | "regional"
  | "dpia"
  | "ropa";

const FOOTER: Array<{ id: "privacy" | "terms" | "help"; label: string }> = [
  { id: "privacy", label: "Privacy Policy" },
  { id: "terms", label: "Terms and Conditions" },
  { id: "help", label: "Help" },
];

type Section = { heading: string; paragraphs: string[] };

const DOCUMENTS: Record<Exclude<DocId, "help">, { title: string; sections: Section[]; related: DocId[] }> = {
  privacy: {
    title: "Privacy Policy",
    related: ["dpa", "regional", "dpia", "ropa"],
    sections: [
      {
        heading: "What this covers",
        paragraphs: [
          "Impulse stores the account you create and the rowing sessions recorded for that account. This sample explains what is kept, who on your team can see it, and how to ask for a change.",
          "A coach on your team can see the boats, lineups, and sessions tied to that team. Athletes see their own sessions and the lineup they are assigned to.",
        ],
      },
      {
        heading: "Account information",
        paragraphs: [
          "We keep your email, username, password hash or Google sign-in, role, team, and the settings you choose, such as distance units and email preferences. Support inquiries are stored with your account and the time they were sent.",
        ],
      },
      {
        heading: "Session and sensor data",
        paragraphs: [
          "A session can include raw sensor readings, processed telemetry such as power, force, and oar angle, and summary metrics such as stroke count and average power. That data is linked to the session and the athlete who rowed it.",
          "Distance and duration shown on a session card come from the session record. Profile totals add those sessions for the signed-in athlete or coach.",
        ],
      },
      {
        heading: "How long it is kept",
        paragraphs: [
          "Account and session records stay until the account is deleted or a team asks for its data to be removed. Login sessions expire after 14 days. Confirmation codes and sign-in challenges are short-lived.",
        ],
      },
    ],
  },
  terms: {
    title: "Terms and Conditions",
    related: ["eula", "guidelines", "sale", "oss"],
    sections: [
      {
        heading: "Using Impulse",
        paragraphs: [
          "Impulse is a training dashboard for rowing crews. You need an account, and an athlete or coach joins or creates a team before the dashboard is available.",
          "These terms cover use of the website. The license for the software, community rules, and any future purchase terms are separate documents linked below.",
        ],
      },
      {
        heading: "Your account",
        paragraphs: [
          "You are responsible for the email, username, and password on the account. Do not share the password. A coach’s team code is for athletes who belong on that team.",
          "Usernames are unique, 3 to 24 characters, and use letters, numbers, and underscores. Passwords need at least 8 characters, an uppercase letter, and a number.",
        ],
      },
      {
        heading: "Team data",
        paragraphs: [
          "Sessions, boats, and lineups belong to the team they were recorded for. A coach can edit the boats and seats on that team. Do not upload data for an athlete who has not joined the team.",
        ],
      },
      {
        heading: "Changes",
        paragraphs: [
          "The dashboard can change as features are added. Continued use of the signed-in site is acceptance of the current sample terms. If a term is unacceptable, stop using the account and contact customer service.",
        ],
      },
    ],
  },
  eula: {
    title: "End User License Agreement",
    related: ["terms", "oss"],
    sections: [
      {
        heading: "License",
        paragraphs: [
          "Impulse grants you a personal, non-exclusive license to use the dashboard while your account is in good standing. The license is for training and coaching. It is not a sale of the software.",
        ],
      },
      {
        heading: "Limits",
        paragraphs: [
          "Do not copy the service, resell access, or try to extract the source, models, or sensor calibration except where an open-source license already allows it. Do not probe the service in a way that disrupts other crews.",
          "Sensor hardware, if you use it, is separate from this website license.",
        ],
      },
      {
        heading: "End of the license",
        paragraphs: [
          "The license ends when the account is closed or access is suspended for a violation of the terms or community guidelines. Sections about team data and acceptable use still apply to data already stored.",
        ],
      },
    ],
  },
  guidelines: {
    title: "Community Guidelines",
    related: ["terms"],
    sections: [
      {
        heading: "On the team",
        paragraphs: [
          "Use boat names, seat labels, and chat for the crew. Keep comments about an athlete’s rowing, not about the person. Coaches and athletes on the same team can see shared lineups.",
        ],
      },
      {
        heading: "What is not allowed",
        paragraphs: [
          "Do not harass a teammate, share another athlete’s session outside the team, or use the account to impersonate someone. Do not send support inquiries that are abusive or unrelated to Impulse.",
        ],
      },
      {
        heading: "Moderation",
        paragraphs: [
          "A coach can edit seats and boats for their team. Impulse can suspend an account that breaks these guidelines. If something on your team looks wrong, send a customer service inquiry with the boat or session and what happened.",
        ],
      },
    ],
  },
  sale: {
    title: "Terms of Sale",
    related: ["terms"],
    sections: [
      {
        heading: "Purchases",
        paragraphs: [
          "The Impulse dashboard sample does not sell subscriptions or in-app items today. If a team plan, hardware kit, or other paid product is offered later, the price, billing period, and what is included will be shown before you pay.",
        ],
      },
      {
        heading: "Refunds and taxes",
        paragraphs: [
          "Any future charge would be billed to the payment method you provide. Taxes are added where required. Refunds, when a product is sold, would follow the policy shown at checkout and the rules of the region where the team is based.",
        ],
      },
      {
        heading: "Hardware",
        paragraphs: [
          "Oarlock, footboard, and other sensor hardware would be covered by their own order terms, warranty, and shipping policy. A hardware order is separate from the license to use the dashboard.",
        ],
      },
    ],
  },
  dpa: {
    title: "Data Processing Agreement",
    related: ["privacy", "ropa", "dpia"],
    sections: [
      {
        heading: "Roles",
        paragraphs: [
          "For team training data, the club or coach who creates the team is the controller. Impulse processes that data to provide the dashboard: accounts, boats, sessions, telemetry, and support tickets.",
        ],
      },
      {
        heading: "Instructions",
        paragraphs: [
          "Impulse uses the data to sign you in, show sessions, compute metrics, and answer a support inquiry. It is not used to advertise to athletes or sold to another company.",
          "People who can receive it are the athlete, coaches on that team, and the infrastructure that hosts the database and sends email.",
        ],
      },
      {
        heading: "Deletion",
        paragraphs: [
          "A team can ask customer service to delete a session or an account. Deletion removes the account’s login and the rows tied to that user, including telemetry and support tickets.",
        ],
      },
    ],
  },
  oss: {
    title: "Open Source Software",
    related: ["eula"],
    sections: [
      {
        heading: "What the dashboard uses",
        paragraphs: [
          "The site is built with open-source software, including React, Vite, Express, and the PostgreSQL driver. Those components stay under their own licenses. Impulse’s sample text, graphics, and product design are not open source.",
          "Charts are drawn with a charting library used under that library’s license. It is listed separately from the open-source dependencies.",
        ],
      },
      {
        heading: "Audit",
        paragraphs: [
          "Dependencies are added in the project manifests. When a package is added or upgraded, its license and purpose are reviewed so a copyleft license is not pulled into the closed-source product by accident.",
          "A security update for a dependency should be applied even when the visible dashboard does not change.",
        ],
      },
    ],
  },
  regional: {
    title: "Regional Privacy",
    related: ["privacy", "dpia"],
    sections: [
      {
        heading: "Where data is handled",
        paragraphs: [
          "Accounts in this sample are stored in the database that hosts the Impulse service. Teams may row in more than one region. The same privacy policy applies to every account.",
        ],
      },
      {
        heading: "European and UK teams",
        paragraphs: [
          "If a crew is in the EU or the UK, the privacy policy, data processing agreement, DPIA, and record of processing activities describe the purpose, the data, and the access controls. Athletes can ask for a copy or a correction through customer service.",
        ],
      },
      {
        heading: "Sale of personal information",
        paragraphs: [
          "Impulse does not sell personal information and does not share it for cross-context advertising. Team coaches see team data because that is the service the crew signed up for.",
        ],
      },
    ],
  },
  dpia: {
    title: "Data Protection Impact Assessment",
    related: ["privacy", "dpa"],
    sections: [
      {
        heading: "The processing",
        paragraphs: [
          "Impulse records rowing telemetry and shows it to the athlete and their coach. The data can describe how someone rows across a session, including power, force, and oar angle, tied to a name and a team.",
        ],
      },
      {
        heading: "Risks",
        paragraphs: [
          "The main risk is that training data is seen by the wrong person, or that a comparison between athletes is used outside the boathouse. A smaller risk is a support ticket that includes more personal detail than the question needs.",
        ],
      },
      {
        heading: "Safeguards",
        paragraphs: [
          "Sign-in is required. Sessions are limited to the athlete and the coach on that session. Team membership is required before the dashboard opens. Passwords are hashed. The customer service form stores only the subject, the message, the account, and the time.",
        ],
      },
    ],
  },
  ropa: {
    title: "Record of Processing Activities",
    related: ["privacy", "dpa"],
    sections: [
      {
        heading: "Accounts",
        paragraphs: [
          "Purpose: create a login, assign a role, and attach a team. Data: email, username, password hash or sign-in provider, role, team. Recipients: the account holder and, for the team code and roster, the coach. Retention: until the account is deleted.",
        ],
      },
      {
        heading: "Sessions and telemetry",
        paragraphs: [
          "Purpose: show a workout and its metrics. Data: session time, distance, duration, raw sensor samples, power, force, oar angle, and summary metrics. Recipients: the athlete and the coach on that session. Retention: until the session or account is deleted.",
        ],
      },
      {
        heading: "Support",
        paragraphs: [
          "Purpose: answer an inquiry. Data: subject, message, account, and the time the ticket was created. Recipients: Impulse customer service. Retention: until the ticket is no longer needed to handle the request.",
        ],
      },
    ],
  },
};

export function SiteFooter({ onOpen, current }: { onOpen: (id: DocId) => void; current?: DocId | null }) {
  return (
    <footer className="site-footer">
      {FOOTER.map((item) => (
        <button key={item.id} type="button" aria-current={current === item.id ? "page" : undefined} onClick={() => onOpen(item.id)}>
          {item.label}
        </button>
      ))}
    </footer>
  );
}

export function AuthFrame({ children }: { children: ReactNode }) {
  const [doc, setDoc] = useState<DocId | null>(null);
  return (
    <div className="auth-screen">
      <div className="auth-screen-body" hidden={doc !== null}>
        {children}
      </div>
      {doc && (
        <div className="auth-screen-body doc-host">
          <DocView id={doc} signedIn={false} onOpen={setDoc} onBack={() => setDoc(null)} />
        </div>
      )}
      <SiteFooter current={doc} onOpen={setDoc} />
    </div>
  );
}

export function DocView({
  id,
  signedIn,
  onOpen,
  onBack,
}: {
  id: DocId;
  signedIn: boolean;
  onOpen: (id: DocId) => void;
  onBack?: () => void;
}) {
  const centered = id === "help" || id === "privacy" || id === "terms";
  if (id === "help") {
    return (
      <main className="doc-page doc-centered doc-help">
        {onBack && (
          <button className="doc-back" type="button" onClick={onBack}>
            Back
          </button>
        )}
        <HelpPage signedIn={signedIn} />
      </main>
    );
  }
  const doc = DOCUMENTS[id];
  return (
    <main className={centered ? "doc-page doc-centered" : "doc-page"}>
      {onBack && (
        <button className="doc-back" type="button" onClick={onBack}>
          Back
        </button>
      )}
      <article>
        <h1>{doc.title}</h1>
        <p className="doc-kicker">Sample document for Impulse.</p>
        {doc.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
        {doc.related.length > 0 && (
          <div className="doc-links">
            {doc.related.map((related) => (
              <button key={related} type="button" onClick={() => onOpen(related)}>
                {related === "help" ? "Help" : DOCUMENTS[related].title}
              </button>
            ))}
          </div>
        )}
      </article>
    </main>
  );
}

function HelpPage({ signedIn }: { signedIn: boolean }) {
  const [header, setHeader] = useState("");
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNote("");
    if (!signedIn) {
      setError("Sign in to send an inquiry.");
      return;
    }
    setSending(true);
    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ header, text }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Could not send that inquiry.");
        return;
      }
      setHeader("");
      setText("");
      setNote("Inquiry sent.");
    } catch {
      setError("Could not send that inquiry.");
    } finally {
      setSending(false);
    }
  }

  return (
    <article className="help-card">
      <h1>Help and Customer Service</h1>
      <p className="doc-kicker">Submit an inquiry and we will store it with your account.</p>
      {!signedIn && <p className="account-hint">Sign in to send an inquiry.</p>}
      <form onSubmit={(event) => void submit(event)}>
        <label className="auth-field">
          <span>Subject</span>
          <input value={header} onChange={(event) => setHeader(event.target.value)} maxLength={160} required disabled={!signedIn} />
        </label>
        <label className="auth-field">
          <span>Inquiry</span>
          <textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={4000} rows={6} required disabled={!signedIn} />
        </label>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        {note && <p className="account-note">{note}</p>}
        <button className={sending ? "auth-submit busy" : "auth-submit"} type="submit" disabled={sending || !signedIn}>
          {sending ? "Sending" : "Submit inquiry"}
        </button>
      </form>
    </article>
  );
}
