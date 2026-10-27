import cors from "cors";
import express from "express";
import { registerAuth } from "./auth.js";
import { migrate } from "./db.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "dashboard" });
});

registerAuth(app);

await migrate();

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
