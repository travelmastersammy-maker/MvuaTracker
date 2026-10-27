# Community data retention schedule

**Status:** Implemented in the API; proposed operational policy for operator review before public launch  
**Effective date:** 27 October 2026  
**Review interval:** Every six months, and after a material change to data use or hosting

This schedule applies to community rain reports and related moderation flags in the production PostgreSQL database. It is intended to limit storage to the short period needed to show recent observations and handle abuse reports. It is a product policy proposal, not legal advice; the data controller must review and approve it.

| Record | Purpose | Retention | Deletion action |
| --- | --- | --- | --- |
| Rain report, including coordinates, pseudonymous reporter key, severity, comment/held comment, moderation result, and accepted-terms version/time | Show recent reports and investigate report or moderation abuse | 30 days after `reported_at` | Delete the full report row and JSON payload |
| Content/contributor flag, including reason and pseudonymous actor key | Deduplicate flags and enforce the three-distinct-key hiding threshold | No longer than 30 days after flag creation, and never beyond the lifetime of its target report | Delete the flag row; deleting its target report cascades to its flags |
| Local development JSON reports and flags | Test the same report and moderation flow locally | Same 30-day limits | Delete on startup and during the hourly cleanup sweep |

The live feed displays eligible observations for only 24 hours. The 30-day database period is an additional short moderation/integrity window, not the public display period. The API runs cleanup at startup and once per hour; therefore a row is deleted shortly after its 30-day expiry, with a maximum normal sweep delay of about one hour. An expired report is also filtered out of the feed even before cleanup runs.

## Backups and deletion

Deleting a live row does not instantly remove earlier copies from provider recovery backups. Render documents a point-in-time recovery window of three days for Hobby workspaces and seven days for Pro or higher; manually created logical exports are retained by Render for seven days. Restoring a pre-deletion backup could bring expired rows back, so rerun the retention cleanup after a recovery. The operator must not keep downloaded exports beyond seven days unless a separately approved, documented retention purpose and secure deletion date are established. See [Render Postgres backup and recovery documentation](https://render.com/docs/postgresql-backups).

This application does not create logical exports or independent off-platform database backups. Confirm the actual Render workspace/database backup settings after provisioning; do not state shorter backup retention until verified.

## Requests, exceptions, and review

The 30-day schedule does not replace a person's right to request access, correction, or erasure before the scheduled expiry. The service currently has no account sign-in or self-service deletion flow, so the operator must publish a monitored privacy contact and implement a request-handling process before public launch. A documented legal hold may pause deletion only where a valid legal requirement or other approved lawful purpose requires it; retain only the affected records and record the reason, approver, and release date outside the public feed.

At each six-month review, the operator should check whether the original purposes still require each field, confirm cleanup has run, confirm backups/export copies age out as described, and record the review date and any changes here. No long-lived aggregate is kept by the current API after deletion.
