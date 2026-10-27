# Web dashboard

Local dev runs two processes from this directory: the React app (Vite) and the API (Express). The app is what you open in the browser. It proxies `/api` to the API, so you do not open the API port to view the dashboard.

## View the dashboard

From the repo root:

```bash
cd apps/web/dashboard
npm install
npm run dev
```

`npm install` is only needed the first time, or after dependencies change. `npm run dev` starts both workspaces together:

| Process | Command | URL |
| --- | --- | --- |
| Web app | `npm run dev -w frontend` | http://localhost:5173 |
| API | `npm run dev -w backend` | http://localhost:3001 |

Open **http://localhost:5173** in a browser. Leave the terminal running. Stop both processes with Ctrl+C.

The page calls `/api/health`. Vite forwards that to `http://localhost:3001`. A healthy API responds with:

```json
{ "ok": true, "service": "dashboard" }
```

Check it directly with:

```bash
curl http://localhost:3001/api/health
```

## Run one process

Use this when you only need the app or the API:

```bash
npm run dev -w frontend
npm run dev -w backend
```

The dashboard status stays down until the API is listening on port 3001. Override that port with `PORT` (for example `PORT=3002 npm run dev -w backend`). If you change it, update the `/api` proxy in `frontend/vite.config.ts` to the same host and port.

DATABASE_URL is set to local postgresql, move to AWS link afterwards. 


## Workflow: 
1. Login 
2. If haven't, choose either athlete or coach screen
3. Join a team via a code assigned to a team or a link
4. If athlete, can see recent sessions, clicking on a session brings up those statistics, but as an individual view (only them)
5. If coach, can see recent sessions, clicking on a session brings up those statistics but as a boat view. 