# Preliminary data protection screening — MvuaTracker

**Status:** prototype screening, prepared 26 October 2026. This is a product risk review, not legal advice or a formal ODPC Data Protection Impact Assessment (DPIA).

## Data flow observed in the prototype

- Community reports contain a selected Kenyan place, county, latitude/longitude, observation date and time range, rainfall severity, free-text comment, and report timestamp. No account or direct identity field is currently collected.
- Reports are stored in `data/community-reports.json`. The server limits the file to the most recent 5,000 records, but does not yet delete records by age. The UI only displays nearby reports from the last 24 hours; hiding older reports is not deletion.
- Before sending a comment to OpenAI Moderation, local rules hold comments that look like they contain a phone number, email address, URL, or listed blocked phrase. The moderation request sends comment text only. Reports and location fields are not sent to that endpoint.
- Forecast/search requests use Open-Meteo; official warning data comes from the Kenya Meteorological Department. Their processing and transfer terms should be documented before public release.
- `data/community-reports.json`, runtime logs, and `.env` are excluded from Git. Keep them out of commits and public issue attachments.

## Initial risk view

The prototype does not intentionally collect names, account IDs, or precise device GPS. A user-selected place and coordinates can still become personal data if they can reasonably be linked to a person, especially when combined with a timestamp and distinctive comment. Free text can also reveal personal or sensitive information despite warnings and automatic filters.

Based on the current small prototype and the fields observed, a mandatory DPIA is not clearly triggered solely by this limited processing. That is a preliminary view only. Kenya's Data Protection Act section 31 and General Regulations regulation 49 require a DPIA before processing likely to create high risk; listed cases include large-scale processing, sensitive data, children or vulnerable groups, cross-linked datasets, and certain innovative uses. Reassess before public launch or expansion. If a DPIA identifies high residual risk, consult the ODPC before processing.

## Release blockers / actions

1. Publish a privacy notice before accepting reports. Identify the data controller, purposes and lawful basis, exact fields collected, recipients (including moderation and weather providers), retention, user rights, and a contact/complaints route.
2. Set a short, explicit retention period and implement automatic deletion of expired report records. The current 5,000-record cap is not a retention schedule.
3. Confirm the lawful basis, processor terms, and safeguards for any personal data sent to OpenAI or other providers outside Kenya. Keep moderation to comment text and do not send the weather report or coordinates.
4. Add a way for a contributor to request deletion/correction of a report without collecting unnecessary identity data; define a practical abuse and safety response process.
5. Before internet exposure, add HTTPS, request throttling, server-side access controls, secure backups, and an incident/breach response procedure. The local JSON file and localhost prototype are not a production store.
6. Decide whether children can submit reports. Avoid collecting children's personal data unless the product has an appropriate lawful basis and safeguards.
7. Review ODPC controller/processor registration obligations for the entity operating the public service.

## Official references

- [Kenya Data Protection Act and regulations — ODPC](https://www.odpc.go.ke/data-protection-laws-kenya/)
- [ODPC Guidance Note on Data Protection Impact Assessment](https://www.odpc.go.ke/wp-content/uploads/2024/02/ODPC-Guidance-Note-on-Data-Protection-Impact-Assessment-1.pdf)
- [Data Protection (General) Regulations, 2021 — Kenya Law](https://www.kenyalaw.org/kl/fileadmin/pdfdownloads/LegalNotices/2021/LN263_2021.pdf)