# MvuaTracker live-data starter

This is a small live-data prototype isolated from the existing kernel files in this workspace. It connects:

- Open-Meteo geocoding, restricted to Kenya, for place search.
- Open-Meteo forecast data for hourly rain chance and millimetres plus seven daily rain totals.
- Kenya Meteorological Department's CAP RSS feed for official warning headlines.

The browser UI talks only to the local API. The API keeps source fetching and response normalization behind one boundary, and caches geocoding for an hour, forecasts for 15 minutes, and KMD alerts for 5 minutes. The Android repository in `android/MvuaRepository.kt` calls the same endpoints.

## Run locally

Requires Node.js 18 or newer. From this directory run:

```powershell
node server.js
```

Open `http://localhost:4173`. Select a place from Kenya search results. To use from an Android emulator, use `http://10.0.2.2:4173` as the API base URL. A physical phone needs the computer's LAN address and both devices on the same network. For a released app, deploy this service behind HTTPS and change the Android base URL.

## Source and alert handling

Forecast values are model guidance, credited to Open-Meteo. KMD warnings are returned in a separate field and are labeled official. A failed KMD feed is rendered as unavailable, never as “no warnings.” Community rain reports are submitted separately and appear in the local live feed when they match the selected location and time window. Location matching checks searched town and county as whole phrases, explicitly nationwide wording, and named KMD regions. CAP expiry and dates stated in alert text are honored; alerts without either are treated as stale after seven days. Matching remains text-based rather than polygon-based, so keep the KMD source link visible.

Open-Meteo's free API is for non-commercial use; commercial use needs the appropriate subscription. Retain clear attribution in the app. KMD bulk data access or broader reuse should be agreed with KMD.



## Community rain reports

Users can submit an anonymous observation with a Kenyan town, date, time range, severity, and a comment of up to 280 characters. Reports are stored in `data/community-reports.json` and shown on the home screen when they are within 30 km of the selected forecast location and the observed period ended within the last 24 hours. The feed refreshes every minute while the page is open. Older observations can be submitted for up to seven days but are not shown in the live feed.

Community posts are unverified and comments are escaped before display. This prototype has no accounts, user comment-reporting flow, or managed data store. Automated comment screening is fail-closed; before public launch, add a privacy notice, a defined deletion schedule, abuse reporting, and a production data store with access controls.

## Comment screening

Comments are screened before publication. The server first checks the local phrase list in `moderation-blocklist.txt` and holds comments containing a listed phrase, a possible email/phone number, or an external link. If `OPENAI_API_KEY` is configured in the server environment, the server also sends only the comment text to OpenAI's Moderation API (`omni-moderation-latest`). A flagged result or service error leaves the comment hidden; the rain severity/location report can still appear, marked unverified. With no API key, comments fail closed and remain pending review rather than being published unscreened.

Add locally relevant English, Kiswahili, and Sheng phrases to `moderation-blocklist.txt`, one phrase per line. Pending comments can be reviewed asynchronously with `node review-community-comments.js`; stop the server first so review writes do not race with new submissions. The review tool approves or rejects each comment while preserving the underlying unverified rain report.

For automated screening, copy `.env.example` to `.env` in this project folder and set `OPENAI_API_KEY` there. Restart the server after adding or changing the key. The server re-screens previously held comments at startup and publishes only those that pass. Never put the key in the browser or Android app. The moderation endpoint returns category flags/scores for application policy; keep reviewing false positives and adjust the local list as needed. See the [OpenAI Moderation guide](https://developers.openai.com/api/docs/guides/moderation).
