# MvuaTracker data flow

This describes the current code path and the planned Render deployment. The Render service and database are not provisioned yet, so production processing has not started. The web and Android maps use bundled county boundary data and do not contact an external map service. The browser map uses bundled county boundary data and does not contact an external map service.

## Forecast and alert requests

1. The web or Android client sends a manually selected Kenyan place and coordinates to the MvuaTracker Node API over HTTPS in production.
2. The API requests forecast data from Open-Meteo and warning data from the Kenya Meteorological Department (KMD). It caches forecasts for 15 minutes, geocoding for one hour, and KMD alerts for five minutes.
3. Before returning the forecast, the API adjusts Open-Meteo's rain probability using the forecast amount for each hour and day. For hourly amounts, multipliers are 0% at or below 0.1 mm, 10% above 0.1 through 0.5 mm, 20% above 0.5 through 1 mm, 30% above 1 through 2 mm, 50% above 2 through 5 mm, 75% above 5 through 10 mm, and 100% above 10 mm. The ordinary result is capped at 95%. Daily values use the larger of the day's peak hourly amount and its daily total divided by 24. A location-matched active KMD thunderstorm warning can raise a period with forecast rain to 100%. Original model probabilities are retained in `precipitation_probability_raw` and `precipitation_probability_max_raw`. This deterministic heuristic is not statistically validated and is described in the app as guidance.
4. The API returns the same adjusted values to web and Android clients. The app does not request device GPS permission.

## Community reports and moderation

1. Before posting, a person reads and accepts version `2026-10-31-v1` of the Community Guidelines. The client sends that version with the report; the API rejects missing or outdated acceptance and records the version and acceptance timestamp on the report.
2. The client creates a random installation key. It is pseudonymous, not account authentication, and may be reset or copied. The server uses it to associate reports with a contributor and deduplicate flags. The client stores blocked keys locally; blocking does not create a server-side account restriction.
3. The API checks the report fields and screens optional comment text. If `OPENAI_API_KEY` is configured, comment text is sent to OpenAI moderation; otherwise comments stay hidden pending review. Approved comments and reports remain labelled unverified.
4. When `DATABASE_URL` is configured, report data and moderation flags are stored in PostgreSQL. Without it, local development uses `data/community-reports.json` and `data/community-flags.json`. Production mode refuses to start without `DATABASE_URL`.
5. A flag is stored with its type, reason, target report/contributor key, pseudonymous actor key, timestamp, and status. Three distinct installation keys on the same target trigger automatic hiding. This threshold is an anti-abuse baseline, not a substitute for a staffed review and appeal process.
6. The public `GET /api/community/map` endpoint returns visible observations from the last 24 hours for the Kenya-wide map. It returns place, county, time, severity, and coordinates rounded to two decimal degrees (about 1 km); it omits comments, reporter keys, and moderation data. County boundaries are bundled from geoBoundaries Kenya ADM1 (47 counties; public-domain boundary source RCMRD GeoPortal / Africa GeoPortal).
7. Community terms version `2026-10-31-v1` tells users that recent reports can appear on this nationwide map. The nearby feed continues to use the original, unrounded report coordinates and a 30 km search radius.
6. The public `GET /api/community/map` endpoint returns visible observations from the last 24 hours for the Kenya-wide map. It returns place, county, time, severity, and coordinates rounded to two decimal degrees (about 1 km); it omits comments, reporter keys, and moderation data. County boundaries are bundled from geoBoundaries Kenya ADM1 (47 counties; public-domain boundary source RCMRD GeoPortal / Africa GeoPortal).
7. Community terms version `2026-10-31-v1` tells users that recent reports can appear on this nationwide map. The nearby feed continues to use the original, unrounded report coordinates and a 30 km search radius.

The Android release build receives the deployed API address through Gradle property `MVUA_API_BASE_URL`. Set it to the Render service's generated HTTPS URL after provisioning; debug builds continue to use the local emulator address. Do not put `DATABASE_URL` or `OPENAI_API_KEY` in Android or browser builds.

## Render deployment configuration

`render.yaml` declares a Node web service and a private Render Postgres database in Singapore. Render supplies the database connection string to the web service as `DATABASE_URL`; use the internal URL for service-to-database traffic. The blueprint also requests `OPENAI_API_KEY` as a secret so moderation can be configured without putting credentials in Git or in either app. Syncing this blueprint provisions billable resources according to the selected plans; review current charges and backup/retention options in Render before deployment.

## Data still requiring an operator decision

- Reports and flags are automatically deleted after 30 days under [`COMMUNITY_RETENTION.md`](COMMUNITY_RETENTION.md). The feed display window remains 24 hours. A Render backup may retain a previous copy for its documented recovery window after a live row is deleted.
- The server does not expose account-based deletion because reports are anonymous. A published contact and operational process are needed for privacy requests and abuse appeals.
- Comments can include personal details despite warnings. The operator must decide how to handle deletion requests that refer to an anonymous comment.
- The app does not store the device IP itself, but the hosting, network, moderation, and weather providers may process request metadata under their own policies. Verify provider terms, data locations, and logs before completing Google Play Data safety declarations.
- No local prototype data is copied to production automatically. Review whether any existing local reports have valid consent and should be transferred before importing them.
