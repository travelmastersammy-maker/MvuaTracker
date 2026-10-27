# MvuaTracker data flow

This describes the current code path and the planned Render deployment. The Render service and database are not provisioned yet, so production processing has not started.

## Forecast and alert requests

1. The web or Android client sends a manually selected Kenyan place and coordinates to the MvuaTracker Node API over HTTPS in production.
2. The API requests forecast data from Open-Meteo and warning data from the Kenya Meteorological Department (KMD). It caches forecasts for 15 minutes, geocoding for one hour, and KMD alerts for five minutes.
3. The API returns normalized results to the client. The app does not request device GPS permission.

## Community reports and moderation

1. Before posting, a person reads and accepts version `2026-10-27-v1` of the Community Guidelines. The client sends that version with the report; the API rejects missing or outdated acceptance and records the version and acceptance timestamp on the report.
2. The client creates a random installation key. It is pseudonymous, not account authentication, and may be reset or copied. The server uses it to associate reports with a contributor and deduplicate flags. The client stores blocked keys locally; blocking does not create a server-side account restriction.
3. The API checks the report fields and screens optional comment text. If `OPENAI_API_KEY` is configured, comment text is sent to OpenAI moderation; otherwise comments stay hidden pending review. Approved comments and reports remain labelled unverified.
4. When `DATABASE_URL` is configured, report data and moderation flags are stored in PostgreSQL. Without it, local development uses `data/community-reports.json` and `data/community-flags.json`. Production mode refuses to start without `DATABASE_URL`.
5. A flag is stored with its type, reason, target report/contributor key, pseudonymous actor key, timestamp, and status. Three distinct installation keys on the same target trigger automatic hiding. This threshold is an anti-abuse baseline, not a substitute for a staffed review and appeal process.

The Android release build receives the deployed API address through Gradle property `MVUA_API_BASE_URL`. Set it to the Render service's generated HTTPS URL after provisioning; debug builds continue to use the local emulator address. Do not put `DATABASE_URL` or `OPENAI_API_KEY` in Android or browser builds.

## Render deployment configuration

`render.yaml` declares a Node web service and a private Render Postgres database in Singapore. Render supplies the database connection string to the web service as `DATABASE_URL`; use the internal URL for service-to-database traffic. The blueprint also requests `OPENAI_API_KEY` as a secret so moderation can be configured without putting credentials in Git or in either app. Syncing this blueprint provisions billable resources according to the selected plans; review current charges and backup/retention options in Render before deployment.

## Data still requiring an operator decision

- Reports and flags currently have no automatic age-based deletion from PostgreSQL. The 24-hour feed window only controls display, not storage retention.
- The server does not expose account-based deletion because reports are anonymous. A published contact and operational process are needed for privacy requests and abuse appeals.
- Comments can include personal details despite warnings. The operator must decide how to handle deletion requests that refer to an anonymous comment.
- The app does not store the device IP itself, but the hosting, network, moderation, and weather providers may process request metadata under their own policies. Verify provider terms, data locations, and logs before completing Google Play Data safety declarations.
- No local prototype data is copied to production automatically. Review whether any existing local reports have valid consent and should be transferred before importing them.
