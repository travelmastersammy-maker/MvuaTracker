# MvuaTracker privacy policy — draft for completion before Play release

**Last updated:** 27 October 2026
**Data controller:** [Insert legal name of the person or entity operating MvuaTracker]
**Privacy contact:** [Insert monitored email and/or postal contact]
**Public policy URL:** [Publish this policy at a stable HTTPS URL and set `MVUA_PRIVACY_POLICY_URL` in the Android release build]

## Information MvuaTracker processes

- **Chosen forecast location:** the town/county selected by the user and its coordinates, sent to the MvuaTracker API to retrieve a forecast and nearby reports. The app does not request the device's GPS location.
- **Community rain observation:** selected town/county and coordinates, observation date and time range, severity, optional comment, and submission time. Reports are shown as unverified, matched to nearby forecast locations, and displayed for a limited live-feed window.
- **Community safety controls:** a random per-installation pseudonymous key is sent with a report and used to associate posts and deduplicate content/contributor flags. It is not an account identifier or verified identity. The key and accepted Community Guidelines version/time are included in the report record. A block list is stored locally on the user's device. Flags include reason, target, reporter key, and timestamp.
- **Comment moderation:** comment text may be sent by the service to its automated moderation provider. The provider's current identity, privacy notice, processing terms, international transfer safeguards, and retention settings must be confirmed and named here before public launch.
- **Weather services:** forecast lookups use Open-Meteo. Official warning data comes from the Kenya Meteorological Department. Confirm and document any data those providers receive from the production configuration.

## Purpose and lawful basis

[The operator must identify the lawful basis and explain the purpose for each processing activity before publishing this policy.]

## Sharing and international transfers

The proposed Render blueprint runs the API and managed PostgreSQL in Singapore. Render injects the database connection string into the API; the service uses Render's internal connection. This deployment is not yet provisioned. If deployed as configured, report and flag records will be stored in that PostgreSQL database. Comment text may also be sent to OpenAI when the operator configures `OPENAI_API_KEY`. Forecast and place requests go to Open-Meteo; official alert retrieval goes to KMD. Confirm provider roles, data locations, transfer safeguards, processing terms, logs, and retention from the actual production configuration before publishing this policy.

## Retention and deletion

Local development uses JSON files; the hosted configuration uses PostgreSQL. Reports, including comments and pseudonymous reporter keys, are deleted 30 days after submission. Associated moderation flags are deleted no later than 30 days after creation and cascade away when the target report is deleted. Cleanup runs at startup and hourly; the feed itself displays reports for only 24 hours. Render recovery backups may retain a previous copy for up to the configured three-day (Hobby workspace) or seven-day (Pro or higher) point-in-time recovery window; Render retains manually created logical exports for seven days. A restore may reintroduce deleted rows, so cleanup must run again after a restore. Confirm the actual workspace backup settings and explain this backup delay in the published policy. Review [`COMMUNITY_RETENTION.md`](COMMUNITY_RETENTION.md). Do not treat this draft as the final production policy.

## User choices and requests

Users choose a place manually and can submit an observation without an account. The app does not yet provide self-service access, correction, or erasure. [Before publication, add a monitored privacy contact and a process for access, correction, erasure, objection, and complaints, including handling requests made before the 30-day deletion.] The operator must not claim the production policy is complete until these contact and process details are added.

## Children and safety

[State the intended audience and safeguards for reports or comments submitted by children.]

## Security and changes

Describe the production controls (HTTPS, access control, key management, backups, incident response) before release. This policy must be updated if the API, moderation provider, weather services, or data uses change.
