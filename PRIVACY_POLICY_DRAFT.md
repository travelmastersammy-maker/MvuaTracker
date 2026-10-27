# MvuaTracker privacy policy — draft for completion before Play release

**Last updated:** 27 October 2026
**Data controller:** [Insert legal name of the person or entity operating MvuaTracker]
**Privacy contact:** [Insert monitored email and/or postal contact]
**Public policy URL:** [Publish this policy at a stable HTTPS URL and set `MVUA_PRIVACY_POLICY_URL` in the Android release build]

## Information MvuaTracker processes

- **Chosen forecast location:** the town/county selected by the user and its coordinates, sent to the MvuaTracker API to retrieve a forecast and nearby reports. The app does not request the device's GPS location.
- **Community rain observation:** selected town/county and coordinates, observation date and time range, severity, optional comment, and submission time. Reports are shown as unverified, matched to nearby forecast locations, and displayed for a limited live-feed window.
- **Comment moderation:** comment text may be sent by the service to its automated moderation provider. The provider's current identity, privacy notice, processing terms, international transfer safeguards, and retention settings must be confirmed and named here before public launch.
- **Weather services:** forecast lookups use Open-Meteo. Official warning data comes from the Kenya Meteorological Department. Confirm and document any data those providers receive from the production configuration.

## Purpose and lawful basis

[The operator must identify the lawful basis and explain the purpose for each processing activity before publishing this policy.]

## Sharing and international transfers

The production server should send only the minimum data necessary to each provider. Describe each provider, its role, location, transfer safeguards, and applicable processing terms here. Community report text, location coordinates, or other data must not be sent to a provider unless disclosed and necessary for the stated purpose.

## Retention and deletion

The current prototype stores community reports in a local JSON file and limits the file to 5,000 entries; that limit is not a time-based retention schedule. Before release, the operator must configure a defined retention period and automatic deletion, and replace prototype file storage with an appropriately secured production data store. Publish the actual retention periods here.

## User choices and requests

Users choose a place manually and can submit an observation without an account. [Add how a person can request access, correction, deletion, object to processing, or make a complaint; add the response contact and process.]

## Children and safety

[State the intended audience and safeguards for reports or comments submitted by children.]

## Security and changes

Describe the production controls (HTTPS, access control, key management, backups, incident response) before release. This policy must be updated if the API, moderation provider, weather services, or data uses change.