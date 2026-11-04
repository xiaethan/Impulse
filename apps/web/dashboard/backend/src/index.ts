import cors from "cors";
import express from "express";
import { registerAuth, seedMockAccounts } from "./auth.js";
import { migrate } from "./db.js";
import { registerTelemetry } from "./telemetry.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "dashboard" });
});

registerAuth(app);
registerTelemetry(app);

await migrate();
await seedMockAccounts();

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
