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

Local development uses JSON files; the hosted configuration uses PostgreSQL. The 24-hour feed window controls display only and does not delete records. PostgreSQL records and moderation flags currently have no automatic age-based deletion. Before release, the operator must choose and implement a retention period, backup expiry, and deletion process, then publish the actual periods here. Do not treat this draft as the final production policy.

## User choices and requests

Users choose a place manually and can submit an observation without an account. [Add how a person can request access, correction, deletion, object to processing, or make a complaint; add the response contact and process.]

## Children and safety

[State the intended audience and safeguards for reports or comments submitted by children.]

## Security and changes

Describe the production controls (HTTPS, access control, key management, backups, incident response) before release. This policy must be updated if the API, moderation provider, weather services, or data uses change.
