# MvuaTracker

[![Android debug build](https://github.com/travelmastersammy-maker/MvuaTracker/actions/workflows/android-build.yml/badge.svg)](https://github.com/travelmastersammy-maker/MvuaTracker/actions/workflows/android-build.yml)

MvuaTracker is a standalone Kenya-focused weather application built around rainfall: how much rain is forecast, where official warnings apply, and what people nearby are observing. This repository contains the web app, Node.js API, and native Android app as one independent product.

## What it does

- Search Kenyan towns and counties.
- View rainfall-aware hourly estimates and amounts, plus a seven-day outlook with date and time filters.
- Read Kenya Meteorological Department (KMD) weather alerts matched to the selected location.
- Submit community rain observations with a place, observation date and time, severity, and optional comment.
- View recent nearby community reports, clearly labelled as unverified.
- Screen comments before publication using local safety checks and optional automated moderation.
- Use the responsive web app or the native Android client, which share the same API.

## Project components

- `public/` — responsive web client.
- `server.js` — HTTP API and source adapters.
- `lib/alerts.js` — CAP parsing and location-aware KMD alert matching.
- `lib/reports.js` — community report validation, storage, retention, and feed filtering.
- `lib/moderation.js` — local screening and optional automated comment moderation.
- `render.yaml` — Render web service and managed PostgreSQL blueprint.
- `DATA_FLOW.md` — current API, moderation, and planned hosted data flow, including open release decisions.
- `android/` — Kotlin and Jetpack Compose Android app and its Gradle build.
- `.github/workflows/android-build.yml` — CI workflow that builds a debug APK and uploads it as an Actions artifact.
- `PRIVACY_POLICY_DRAFT.md` — policy draft that still needs operator details and a public URL before release.

## Weather data and limitations

Place search and forecast data use Open-Meteo. The API returns hourly rain amounts with a rainfall-aware percentage calculated from the corresponding forecast amount. Daily percentages use the greater of the day's peak hourly amount and its total divided by 24. Light amounts lower the underlying model chance, and ordinary estimates are capped at 95%; a location-matched active KMD thunderstorm warning can allow 100% for a period with forecast rain. Original model probabilities remain in the API response. This transparent heuristic is not statistically validated, and forecasts are guidance rather than a guarantee that rain will occur at every point in a town. Daily totals, official KMD warnings, and community observations are presented separately.

Alert-to-town matching currently uses place, county, and named KMD region text, with alert expiry and stated dates considered. It is not polygon-based, so it may not precisely identify every affected area. A KMD feed failure is shown as unavailable rather than as an absence of warnings. Open-Meteo model values are guidance, not official KMD forecasts; source links and attribution should remain visible.

## Run the web app and API locally

Requires Node.js 24 or newer. From a fresh clone, run these commands in the repository root:

```powershell
npm ci
npm test
npm run lint
npm start
```

Open `http://localhost:4173`. The server exposes `/api/search`, `/api/weather`, and `/api/reports`. It caches geocoding for an hour, forecasts for 15 minutes, and KMD alerts for 5 minutes.

For community comment screening, copy `.env.example` to `.env`, set `OPENAI_API_KEY` on the server, and restart it. The API sends comment text to the moderation service when configured. Without the key, comments remain pending rather than being published unscreened. Never place this key in the web client or Android app. Pending comments can be reviewed using:

```powershell
node review-community-comments.js
```

Community reports use local JSON storage for development when `DATABASE_URL` is blank. When `DATABASE_URL` is set, the API stores reports and moderation flags in PostgreSQL. In production mode the API refuses to start without the database. The feed shows reports near the selected forecast location from the last 24 hours; observations can be submitted for up to seven days. A report requires acceptance of the current Community Guidelines. Per-installation random keys support attribution and deduplicated flags without accounts; blocks stay on the user's device. Three unique flags on the same update or contributor trigger automatic hiding.

The Render blueprint in `render.yaml` configures the Node API and private PostgreSQL in Singapore. It injects the internal database URL as `DATABASE_URL` and keeps `OPENAI_API_KEY` as a service secret. Review the plans and charges before syncing the blueprint. The hosted schema is created automatically at service startup. Reports and related flags are now purged after 30 days; the cleanup runs at startup and hourly. The policy and Render backup limits are documented in [`COMMUNITY_RETENTION.md`](COMMUNITY_RETENTION.md). A privacy-request contact/process and migration review for old local reports are still needed before public launch. Read [`DATA_FLOW.md`](DATA_FLOW.md) before deploying or completing Play declarations.

## Android app

The native Android client is in `android/`. It uses the same API for location search, forecasts, KMD warnings, and community reports. Its olive-and-savannah design includes the rain dashboard, selectable hourly forecast, date ranges, community feed, report form, and privacy information.

Open the `android/` directory in Android Studio to sync and run the app. The debug build defaults to `http://10.0.2.2:4174` for an Android emulator. To run the local API on that port, use `$env:PORT = "4174"` and then `node server.js` in PowerShell. A physical device needs an API address reachable over the local network. Debug builds allow cleartext only to support local development; release builds require HTTPS.

GitHub Actions runs the Node.js test and lint checks on pushes and pull requests. The Android workflow currently builds a **debug APK**. The latest successful build is [run #40454946566](https://github.com/travelmastersammy-maker/MvuaTracker/actions/runs/40454946566); download its `mvuatracker-debug-apk` artifact to install and test. This APK is for testing and is not a Play Store release bundle.

## Current release status

**Development status:** The web/API project is runnable locally, and the native Android debug APK builds successfully in GitHub Actions.

**Google Play status:** Not ready for submission yet. A release requires a deployed HTTPS API with production storage and moderation secrets, a completed and publicly hosted privacy policy, release signing/Play App Signing configuration, a signed Android App Bundle, device testing, and completed Play Console declarations and listing assets. See [`android/PLAY_RELEASE_CHECKLIST.md`](android/PLAY_RELEASE_CHECKLIST.md).

## Community safety and privacy

Rain observations are user-submitted and unverified; they must not be presented as official warnings. Comments are checked against a local phrase list and patterns for contact details or links. When configured, the server also uses automated content moderation; flagged results or service failures keep the comment hidden while the weather report can remain visible.

The app does not request device GPS permission or require an account. Users choose a place manually. The privacy policy remains a draft until the operator fills in the data controller/contact, provider details, lawful basis, retention/deletion process, user-request contact, and intended audience, then publishes it at a stable HTTPS URL. The current proposed Render deployment stores community reports and moderation flags in a Singapore PostgreSQL database; it is not provisioned yet. Review [`DATA_FLOW.md`](DATA_FLOW.md) and confirm the final deployed providers/data locations before completing Google Play’s Data safety declaration.

## Attribution and service terms

Keep Open-Meteo attribution in the app and review its current terms before commercial use. Coordinate broader KMD data reuse with KMD. Provider terms and data handling should be reviewed again before public launch.

## Rain probability calibration

The server scales Open-Meteo's probability according to forecast rainfall: 0% for 0.1 mm or less, then 10% of the source value above 0.1 through 0.5 mm, 20% above 0.5 through 1 mm, 30% above 1 through 2 mm, 50% above 2 through 5 mm, 75% above 5 through 10 mm, and 100% above 10 mm. The adjusted percentage is capped at 95% except for a period with nonzero forecast rain covered by a location-matched active KMD thunderstorm warning. When an amount is missing, the source percentage is retained up to 95%. The API also returns the original values in `precipitation_probability_raw` and `precipitation_probability_max_raw`. These thresholds are a transparent product heuristic, not a statistically validated probability model; compare them with observed rainfall and tune them before treating them as calibrated meteorology.
