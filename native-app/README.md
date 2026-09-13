# Pyrocel CRM — Native App (Capacitor)

This is the iOS + Android native shell for the Pyrocel CRM. It exists to give the
lone-worker safety feature the capabilities a browser cannot provide:

- **Background location** that keeps running when the phone is locked, the app is
  backgrounded, or the app is force-quit (Transistorsoft background-geolocation).
- **Native push** (FCM/APNs) that reaches a locked phone with the app closed.
- **Critical alerts** that can sound through silent mode on iOS.

## Architecture — remote URL, not a bundle

The CRM is a server-rendered Next.js app, so it is **not** statically exported.
The native app is a thin WebView pointing at the deployed site
(`server.url` in `capacitor.config.ts`). All UI, auth (Supabase cookies), and
data come from the live site — you never rebuild the native binary to ship a UI
change. The plugin JS ships **with the deployed site** (already added to the root
`package.json`); the native project just provides the native halves of those
plugins. The web integration lives in the main repo under `lib/native/*` and is
wired into `components/dashboard/lone-worker/lone-worker-prompt.tsx`.

## One-time setup (on a Mac for iOS; Mac or PC for Android)

```bash
cd native-app
npm install
# point the shell at production (or a preview URL for testing)
export CRM_URL="https://your-production-url"
npx cap add ios
npx cap add android
npx cap sync
```

`ios/` and `android/` are generated (git-ignored). Re-run `npx cap sync` after
changing plugins or `capacitor.config.ts`.

## Transistorsoft background-geolocation

This is a **licensed** plugin. Purchase a license per platform at
https://shop.transistorsoft.com and install the key:

- **Android:** add the license to `android/app/src/main/AndroidManifest.xml` as
  documented, and add the Transistorsoft maven repos to the Gradle config.
- **iOS:** add the license via the plugin's setup docs.

Required permissions (the plugin's install docs list the exact entries):

- **iOS** `Info.plist`: `NSLocationWhenInUseUsageDescription`,
  `NSLocationAlwaysAndWhenInUseUsageDescription`, and the `location` +
  `fetch` + `processing` background modes.
- **Android**: `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`,
  `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`.

No client config is needed for where fixes go: the web layer calls
`BackgroundGeolocation.ready()` with the ingest URL + a per-device bearer secret
(from `POST /api/native/register-device`), and the plugin posts fixes natively to
`POST /api/lone-worker/location` even while the app is closed.

## Push notifications (FCM for both platforms)

Use one Firebase project for Android and iOS so a single sender covers both.

1. Create a Firebase project; add an Android app (package `com.pyrocel.crm`) and
   an iOS app (bundle id `com.pyrocel.crm`).
2. Android: drop `google-services.json` into `android/app/`.
3. iOS: drop `GoogleService-Info.plist` into the iOS app target, enable the Push
   Notifications + Background Modes (Remote notifications) capabilities, and
   upload your **APNs Auth Key (.p8)** to Firebase → Cloud Messaging so FCM can
   relay to APNs.
4. Create an Android notification channel with id **`lone-worker`** (high
   importance) — the server sends escalations on this channel.

### Server side (already implemented)

`lib/native/push-send.ts` sends via **FCM HTTP v1** and is wired into the
lone-worker escalation backstop. It is gated on two env vars and is a clean
no-op until they are set:

- `FCM_SERVICE_ACCOUNT` — the Firebase service-account JSON (as a string).
- `FCM_PROJECT_ID` — the Firebase project id (optional if present in the JSON).

Device push tokens are captured by the app at shift start and stored in the
`lone_worker_devices` table.

## Building & releasing

```bash
export CRM_URL="https://your-production-url"
npx cap sync
npx cap open ios        # Xcode → Archive → App Store Connect / TestFlight
npx cap open android    # Android Studio → Generate Signed Bundle → Play Console
```

Because the app loads the remote site, day-to-day CRM changes ship by deploying
the web app as usual — you only resubmit the native binary when native plugins,
permissions, icons, or the `CRM_URL` change.

## CI builds (GitHub Actions)

Two workflows in `.github/workflows/` build the binaries off a developer machine
so you only need to configure secrets once:

- `native-android.yml` — Ubuntu runner, outputs a signed `.aab` (release) or
  `.apk` (debug). Trigger via **Actions → Native Android build → Run workflow**.
- `native-ios.yml` — macOS runner, archives and exports an `.ipa`. Trigger via
  **Actions → Native iOS build → Run workflow**.

Both also run automatically on `main` when `native-app/**` or `lib/native/**`
changes. Set `CRM_URL` (or hardcode it in `capacitor.config.ts`) before release.

### Required repository secrets

Shared:

- `TRANSISTORSOFT_TOKEN` — auth token for the licensed background-geolocation
  npm registry (omit only if you vendor the package another way).

Android:

- `ANDROID_KEYSTORE_BASE64` — base64 of your release keystore
  (`base64 -w0 release.keystore`).
- `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

iOS (also set `teamID` in `ios/App/ExportOptions.plist`):

- `IOS_DIST_CERT_BASE64` — base64 of your Apple distribution cert (`.p12`).
- `IOS_DIST_CERT_PASSWORD` — the `.p12` password.
- `IOS_PROVISION_PROFILE_BASE64` — base64 of the matching provisioning profile.

Downloadable build artifacts are attached to each workflow run. You still upload
to TestFlight / Play Console (or add a fastlane deploy step later).

## What still needs a decision / future work

- **Voice-call escalation** (deferred — SMS-only was chosen for the web backstop).
- **Critical alert entitlement** on iOS (requires an Apple entitlement request)
  if you want emergency alerts to override silent/Do-Not-Disturb.
