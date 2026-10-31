# MvuaTracker Architecture

MvuaTracker is a Kenya-focused rainfall app. This document describes the implemented system; it does not claim a proprietary forecast model, sensor network, or machine-learning pipeline.

## Applications and API

- `public/index.html` is the responsive web client served by `server.js`.
- `android/` contains the Kotlin and Jetpack Compose client.
- The Node API normalizes place search, Open-Meteo forecasts, Kenya Meteorological Department alerts, and community reports for both clients.
- `lib/alerts.js`, `lib/reports.js`, and `lib/moderation.js` hold alert matching, community storage/validation, and comment screening.

## Community reports and map

- Reports are manually associated with a searched Kenyan place, observed time range, and selected rain severity.
- The nearby feed uses the selected forecast coordinates and a 30 km radius. Active observations are shown for up to 24 hours; records are retained for up to 30 days for moderation.
- `GET /api/community/map` returns active observations across Kenya with rounded coordinates. It excludes comments, reporter keys, and moderation details.
- The web SVG map and Android Compose map both use `public/kenya-counties.geojson` (also packaged as an Android asset) for county boundaries. County polygons can be selected; report dot colour and size encode user-reported severity.
- County boundary source: geoBoundaries Kenya ADM1, 47 counties, public-domain dataset sourced from RCMRD GeoPortal / Africa GeoPortal. Attribution appears in both clients.

## Forecast inputs and limits

- Open-Meteo provides the place search and forecast inputs. Kenya Meteorological Department provides official warning data.
- The server applies the documented rainfall-aware percentage heuristic to Open-Meteo probabilities. This is a product heuristic and has not been statistically validated.
- Community reports are unverified and are kept separate from official warnings and model forecasts.

## Storage, checks, and deployment

- Development uses local JSON files; production requires PostgreSQL through `DATABASE_URL`.
- `npm test` runs the Node test suite and `npm run lint` checks the server and JavaScript modules.
- GitHub Actions builds a debug Android APK. The app still requires production hosting, operator-completed privacy documents, signing, and Play Console setup before release.
- See `DATA_FLOW.md`, `COMMUNITY_RETENTION.md`, `PRIVACY_POLICY_DRAFT.md`, and `android/PLAY_RELEASE_CHECKLIST.md` for operational details and remaining release work.
