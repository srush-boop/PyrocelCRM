# Pyrocel CRM — Native App (Capacitor)

This is the iOS + Android native shell for the Pyrocel CRM. It exists to give the
lone-worker safety feature the capabilities a browser cannot provide:

- **Background location** that keeps running when the phone is locked, the app is
  backgrounded, or the app is force-quit (Transistorsoft background-geolocation).
- **Native push** (FCM/APNs) that reaches a locked phone with the app closed.
- **Critical alerts** that can sound through silent mode on iOS.

---

# Step-by-step setup guide

All code and config already live in this repo (`native-app/` + `lib/native/*`).
What's left is accounts, keys and files that must **not** be committed, plus
building on a real computer (a Mac for iOS; a Mac or PC for Android). None of
this can be done inside v0.

> Day-to-day CRM changes go live by deploying the website as usual. You only
> rebuild the app when plugins, permissions, icons or `CRM_URL` change.

## Step 1 — Get the code

1. Install **Git** (https://git-scm.com) and **Node.js 20 LTS** (https://nodejs.org).
2. Clone and install:
   ```bash
   git clone https://github.com/srush-boop/PyrocelCRM.git
   cd PyrocelCRM/native-app
   npm install
   ```

## Step 2 — Install build tools

| Platform | Install | Where |
|---|---|---|
| Android | Android Studio (includes SDK + JDK 17) | https://developer.android.com/studio |
| iOS | Xcode (Mac only) + CocoaPods | Mac App Store; `sudo gem install cocoapods` |

## Step 3 — Accounts

| Account | Cost | Where | Used for |
|---|---|---|---|
| Google Play Console | $25 one-off | https://play.google.com/console | Publishing Android |
| Apple Developer Program | $99/year | https://developer.apple.com/programs | Publishing iOS, APNs key |
| Firebase | Free | https://console.firebase.google.com | Push on both platforms |
| Transistorsoft licence | Paid, per platform | https://shop.transistorsoft.com | Background GPS in release builds (debug works without) |

## Step 4 — Firebase (push notifications)

1. Open (or create) the Firebase project **`amber-pyrocel`**.
2. **Add Android app** — package `com.pyrocel.crm` → download **`google-services.json`**.
3. **Add iOS app** — bundle ID `com.pyrocel.crm` → download **`GoogleService-Info.plist`**.
4. **iOS push key:** Apple Developer → **Certificates, IDs & Profiles → Keys → +**,
   tick **Apple Push Notifications service (APNs)**, download the **`.p8`**.
   Then Firebase → **Project Settings → Cloud Messaging → Apple app configuration**
   → upload the `.p8` with your **Key ID** and **Team ID**.
5. **Server key (already done):** `FCM_SERVICE_ACCOUNT` is set on the Vercel
   project. To replace it: Firebase → **Project Settings → Service accounts →
   Generate new private key**, paste the whole JSON into v0 **Vars** as
   `FCM_SERVICE_ACCOUNT`.

Never commit these files — they are git-ignored.

## Step 5 — Generate native projects

From `native-app/`:

```bash
export CRM_URL="https://crm-fsm.vercel.app"   # or your production domain (must be https)
npx cap add android
npx cap add ios          # Mac only
npx cap sync
```

`android/` and `ios/` are generated and can be deleted/recreated any time.

## Step 6 — Android

1. Apply permissions, licence and Gradle repos (safe to re-run):
   ```bash
   TRANSISTORSOFT_LICENSE="your-android-licence-key" npm run setup:android
   ```
2. Copy `google-services.json` to `native-app/android/app/google-services.json`.
3. Sync and open:
   ```bash
   npx cap sync android
   npx cap open android
   ```
4. **Test:** connect a phone with USB debugging on → **Run ▶** (or `npx cap run android`).
5. **Release:** Android Studio → **Build → Generate Signed Bundle / APK → Android
   App Bundle** → create a keystore. **Back up the keystore and passwords — if
   lost, the app can never be updated.** Upload the `.aab` to Play Console.

The `lone-worker` notification channel is created automatically at runtime.

## Step 7 — iOS (Mac)

1. `npx cap open ios`
2. Xcode → **App** target → **Signing & Capabilities**:
   - Choose your **Team**; bundle ID `com.pyrocel.crm`.
   - **+ Capability → Push Notifications**.
   - **+ Capability → Background Modes**: tick **Location updates**,
     **Background fetch**, **Remote notifications**, **Background processing**.
3. Drag `GoogleService-Info.plist` into `App/App` (tick "Copy items if needed").
4. In `Info.plist` add:
   - `NSLocationWhenInUseUsageDescription` — "Used to share your location with
     the office during lone-worker shifts."
   - `NSLocationAlwaysAndWhenInUseUsageDescription` — "Keeps your safety
     location updated while your phone is locked during a shift."
5. Add the iOS Transistorsoft licence per
   https://github.com/transistorsoft/capacitor-background-geolocation (iOS setup).
6. **Test:** select a connected iPhone → **Run ▶**.
7. **Release:** **Product → Archive → Distribute App → App Store Connect**, test
   in **TestFlight**, then submit for review.

## Step 8 — Optional: cloud builds (GitHub Actions)

Add these under **GitHub → repo Settings → Secrets and variables → Actions**:

| Secret | How to get it |
|---|---|
| `ANDROID_GOOGLE_SERVICES_BASE64` | `base64 -w0 google-services.json` |
| `ANDROID_TRANSISTORSOFT_LICENSE` | Your Android licence key |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 release.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD` | Chosen when creating the keystore |
| `IOS_DIST_CERT_BASE64` / `IOS_DIST_CERT_PASSWORD` | Export distribution cert from Keychain as `.p12` → `base64 -i cert.p12` |
| `IOS_PROVISION_PROFILE_BASE64` | App Store profile from developer.apple.com → `base64 -i profile.mobileprovision` |
| `TRANSISTORSOFT_TOKEN` | Only if your Transistorsoft purchase uses their private package registry |

(On macOS use `base64 -i file` instead of `base64 -w0 file`.) For iOS also set
`teamID` in `ios/App/ExportOptions.plist`.

Run **Actions → Native Android build** (or **Native iOS build**) **→ Run
workflow**. The `.aab` / `.ipa` appears under the run's **Artifacts**.

## Step 9 — Verify

1. Install the app and sign in as an engineer.
2. Start a lone-worker shift; allow location **"Always"** and notifications.
3. Lock the phone for a few minutes — location updates should keep arriving on
   the office monitor page.
4. Let a check-in lapse — the amber/red escalation should arrive as a push on
   the locked phone.

**Still open:** iOS alerts that sound through silent mode need the **Critical
Alerts entitlement** — request it at
https://developer.apple.com/contact/request/notifications-critical-alerts-entitlement.

---

# Technical reference

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

### Android native config (automated)

After `npx cap add android` + `npx cap sync`, run the setup script to apply the
lone-worker native config into the generated project (idempotent — re-runnable):

```bash
cd native-app
TRANSISTORSOFT_LICENSE="your-android-license" npm run setup:android
```

It applies to the generated `android/` project:

- Location + foreground-service + `POST_NOTIFICATIONS` permissions in
  `AndroidManifest.xml`.
- The Transistorsoft licence `<meta-data>` (from `TRANSISTORSOFT_LICENSE`, or a
  placeholder you must replace before a release build).
- The Transistorsoft maven repositories in `android/build.gradle`.

The `lone-worker` notification channel is **not** set here — the web layer
(`lib/native/push.ts`) creates it at runtime on first push registration, so it
always matches the channel id the server sends to. CI runs this step
automatically (see the Android workflow), reading the licence from the
`ANDROID_TRANSISTORSOFT_LICENSE` repo secret.

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
2. Android: get `google-services.json` for the Firebase project `amber-pyrocel`
   (package `com.pyrocel.crm`) and place it at `android/app/google-services.json`.
   The `android/` folder and `google-services.json` are git-ignored (repo policy),
   so it is **not** committed — supply it per build:
   - **Local build:** copy your file into `android/app/google-services.json` after
     `npx cap add android`.
   - **CI build:** it is decoded from the `ANDROID_GOOGLE_SERVICES_BASE64` repo
     secret (see "Required repository secrets"). Generate the secret value with
     `base64 -w0 google-services.json`.
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

- `ANDROID_GOOGLE_SERVICES_BASE64` — base64 of `google-services.json`
  (`base64 -w0 google-services.json`). Firebase project `amber-pyrocel`.
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
