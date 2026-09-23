#!/usr/bin/env node
/**
 * Pre-stages the generated Android project with the native config the
 * lone-worker feature needs, so you don't hand-edit files after every
 * `npx cap add android`. Idempotent — safe to run repeatedly.
 *
 * Run from native-app/ AFTER `npx cap add android` (and `npx cap sync`):
 *   node scripts/setup-android.mjs
 *   TRANSISTORSOFT_LICENSE=xxxx node scripts/setup-android.mjs   # to bake the licence
 *
 * It applies:
 *   1. Background-location + foreground-service + notification permissions to
 *      AndroidManifest.xml
 *   2. The Transistorsoft licence <meta-data> (from TRANSISTORSOFT_LICENSE env,
 *      else a clearly-marked placeholder you MUST replace before a release build)
 *   3. The Transistorsoft maven repositories to android/build.gradle
 *
 * The `lone-worker` notification channel is NOT created here — it is created at
 * runtime by the web layer (lib/native/push.ts) when the app first registers
 * for push, so it always matches the id the server sends to.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = resolve(root, 'android/app/src/main/AndroidManifest.xml')
const buildGradlePath = resolve(root, 'android/build.gradle')

const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'
const fail = (msg) => {
  console.error(`${RED}[setup-android] ${msg}${RESET}`)
  process.exit(1)
}
const info = (msg) => console.log(`[setup-android] ${msg}`)
const warn = (msg) => console.log(`${YELLOW}[setup-android] ${msg}${RESET}`)

if (!existsSync(manifestPath)) {
  fail('android/ not found. Run `npx cap add android` first, then re-run this.')
}

// 1. Manifest permissions
let manifest = readFileSync(manifestPath, 'utf8')
const permissions = [
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
  'android.permission.POST_NOTIFICATIONS',
]
let addedPerms = 0
for (const perm of permissions) {
  if (!manifest.includes(`android:name="${perm}"`)) {
    const line = `    <uses-permission android:name="${perm}" />\n`
    manifest = manifest.replace(/(<manifest[^>]*>\n)/, `$1${line}`)
    addedPerms++
  }
}
info(addedPerms ? `added ${addedPerms} permission(s)` : 'permissions already present')

// 2. Transistorsoft licence meta-data inside <application>
const license =
  process.env.TRANSISTORSOFT_LICENSE || 'PUT_YOUR_TRANSISTORSOFT_LICENSE_HERE'
if (!manifest.includes('com.transistorsoft.locationmanager.license')) {
  const meta = `        <meta-data android:name="com.transistorsoft.locationmanager.license" android:value="${license}" />\n`
  manifest = manifest.replace(/(<application[^>]*>\n)/, `$1${meta}`)
  info('added Transistorsoft licence meta-data')
} else {
  info('Transistorsoft licence meta-data already present (left unchanged)')
}
writeFileSync(manifestPath, manifest)
if (license.startsWith('PUT_YOUR')) {
  warn(
    'no TRANSISTORSOFT_LICENSE set — placeholder written. Replace it before a release build.',
  )
}

// 3. Transistorsoft maven repositories in android/build.gradle
if (!existsSync(buildGradlePath)) {
  fail('android/build.gradle not found. Did `npx cap add android` complete?')
}
let gradle = readFileSync(buildGradlePath, 'utf8')
const hasRepos =
  gradle.includes('npm.transistorsoft.com') ||
  gradle.includes('transistorsoft-capacitor-background-geolocation')
if (hasRepos) {
  info('Transistorsoft maven repositories already present')
} else {
  const repos =
    `        maven { url("\${project(':transistorsoft-capacitor-background-geolocation').projectDir}/libs") }\n` +
    `        maven { url 'https://developer.huawei.com/repo/' }\n`
  // Target the allprojects.repositories block specifically (not buildscript's).
  const allprojectsRepoRe = /(allprojects\s*\{\s*repositories\s*\{\r?\n)/
  if (allprojectsRepoRe.test(gradle)) {
    gradle = gradle.replace(allprojectsRepoRe, `$1${repos}`)
    writeFileSync(buildGradlePath, gradle)
    info('added Transistorsoft maven repositories')
  } else {
    warn(
      'could not locate allprojects.repositories in build.gradle — add these repos manually inside the allprojects { repositories { } } block:\n' +
        repos,
    )
  }
}

info('done. Now run `npx cap sync android` and build.')
