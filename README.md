# Vitality Guard — Pozuelo City Pilot

Investor demonstration of a **proposed** wearable SOS and community-assistance module for Pozuelo de Alarcón. Every person, incident, dispatch, reading, and benefit is simulated. This is not a signed municipal or hospital partnership.

The story on screen:

**Connected member → SOS → nearby eligible responders → assistance and professional coordination → verification → benefit reward.**

A discreet badge in the top bar reads **Investor demo · simulated data**.

## Run

Node.js 22.17 or newer.

```bash
npm install
npm run dev
npm run check
npm test
npm run build
npm run preview
```

Open the dev server URL Vite prints (usually `http://localhost:5173`). Without Google credentials the full story runs on the schematic map.

Optional demo settings (seed, population, layer visibility) are stored in `localStorage`. The app does not request geolocation, notifications, Bluetooth, or personal information.

The all-member map is for this synthetic presenter view. A production responder view would be event-scoped and limited to the minimum information needed for that response.

## Presenter guide (about 2–3 minutes)

1. Press **Run investor demo**. The clock runs at **4×**. Pause and Resume stay available; Presentation hides the advanced controls.
2. The opening caption shows the city: 200 synthetic people, Demo Hospital, Demo Police Base, and Demo Care Hub.
3. A fall alert appears. The discovery radius and only the accepted helper and nurse routes move toward the member.
4. A medical SOS starts while the fall is still open, with clinician and ambulance coordination.
5. After verification, community helpers on the fall receive a fixed demo benefit. Clinicians, the hospital, and police do not receive those credits.
6. A security SOS shows **Community response restricted — professional response requested.** Helpers do not enter the area. A clinician, if sent, waits at a staging point until police clear the scene.
7. The run ends on a summary taken from that simulation: handled incidents, simulated first-arrival times, professional participation, verified helper contributions, and credits issued.

Manual controls, if you leave presentation mode:

- **Start / Pause / Resume / Reset** and speeds **1×, 2×, 4×, 8×**. Pause freezes movement, invitations, and awards.
- Arm **Fall alert**, **Medical SOS**, or **Security SOS**, then click a member or path. **Trigger at nearest member** places it for you. Spots with no eligible member are declined.
- **Reset with new settings** applies the population slider (100–300). Two ambulances are separate from that count.
- **Follow selected incident** pans occasionally. Panning the map yourself turns follow off.
- Layer checkboxes only change visibility.
- **Simulate benefit-service delay** keeps assistance and closure moving while an award stays pending. **Retry pending awards** issues each credit once.

Route lines are labeled in the detail panel as **Illustrative route · simulated ETA**. They follow the local path graph, not live traffic.

## Google Maps

Copy `.env.example` to `.env`:

```bash
PUBLIC_GOOGLE_MAPS_API_KEY=your-browser-key
PUBLIC_GOOGLE_MAPS_MAP_ID=your-map-id
```

Setup follows Google’s current documentation:

- Create a key and enable **Maps JavaScript API**: https://developers.google.com/maps/documentation/javascript/get-api-key
- Advanced Markers need a **Map ID** (vector map). `DEMO_MAP_ID` is Google’s development map ID: https://developers.google.com/maps/documentation/javascript/advanced-markers/overview

The map uses `AdvancedMarkerElement` from the marker library, not an iframe or legacy markers. Cloud styling comes from the map ID; otherwise the map stays a normal roadmap.

Browser keys are visible to users. Restrict the key by HTTP referrer and to the Maps JavaScript API. Putting the key in an environment variable does not make it secret. Do not assume the key is billing-free; confirm the current Google Cloud terms for your project.

If the key is missing, rejected, or the script times out, the app switches to the schematic map and shows one status line. The simulation is the same in both modes.

## Checks

`npm test` covers population totals, matching, reservation conflicts, security restrictions, transitions, cancellation without awards, idempotent benefits, caps, pause, reset isolation, and the guided story.

`npm run check` is the TypeScript and Svelte check. `npm run build` produces the production bundle.

Google mode was not exercised in this workspace when no API key was configured. Schematic mode is the verified path in that case.

## Later integration (not built here)

A production service could add a Go API, PostgreSQL for members and incidents, FHIR for clinical handoff, and a wearable connectivity gateway. Reward settlement could sit behind an adapter (including a ledger) without changing the demo’s exactly-once award key: `incidentId:helperId:policyVersion`. None of those systems run in this showcase. There is no login, database, real notification, payment, or blockchain transaction.
