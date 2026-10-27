# MvuaTracker Play Store release checklist

The native Android project source targets API 36 and is configured for debug against the temporary computer server. It has not yet been compiled because Java, Gradle, and the Android SDK are not installed in the current environment. It is not yet a Play upload: a stable HTTPS backend, signing key, privacy-policy URL/contact, and Play Console setup are required.

## Build a local debug app

Open the `android` folder in Android Studio and let Gradle sync. The debug build uses `http://10.0.2.2:4174`, which works only when an Android emulator can reach the temporary server on this computer. Use the computer's LAN address for a physical-device debug build.

## Before a Play release

1. Deploy the Node API to a managed HTTPS host with durable storage, backups, rate limits, monitoring, and a production moderation key stored as a server secret. Never put the moderation key in the Android app.
2. Set `MVUA_API_BASE_URL` in `android/gradle.properties` or pass it to Gradle as a project property. Release builds reject a non-HTTPS or missing API URL.
3. Create a private upload keystore. Store its values in ignored `android/keystore.properties`; never commit the keystore or passwords. Use Play App Signing in Play Console.
4. Host a privacy policy and put its public URL both in the app and Play Console. Complete an accurate Data safety form for the actual production data flow and provider SDKs/services.
5. Finish the community-report retention/deletion workflow, privacy notice, user complaint/reporting channel, and documented moderation/incident handling.
6. Prepare store listing: app name, short/full description, screenshots, 512×512 icon, feature graphic, support contact, content rating, target audience, and country availability.
7. Build and sign an Android App Bundle (`bundleRelease`), upload to internal testing, fix issues, then run the required closed test if your developer account requires it. New personal accounts created after 13 November 2023 need at least 12 testers opted in continuously for 14 days before applying for production access.
8. Verify current Play policies and target API requirements again at submission time. As of 31 August 2026, new apps and updates must target Android 16 (API 36) or higher.

The app asks for no device location permission. Users choose a town/county themselves. Community reports remain marked unverified. The server currently stores reports locally in JSON, so do not expose that prototype server to public traffic.