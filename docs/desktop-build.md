# Desktop / mobile builds (Tauri)

One-time scaffold, then day-to-day and store release commands.

## First-time init

You need an init step for **iOS** and **Android** (Tauri generates `gen/apple` and `gen/android`). Desktop-only does not need that.

```bash
# From repo root — installs deps, icons, CLI links, then:
#   tauri ios init     (needs Xcode on macOS)
#   tauri android init (needs Android Studio / SDK)
yarn init:desktop
```

Flags:

- `yarn init:desktop --ios-only`
- `yarn init:desktop --android-only`
- `yarn init:desktop --skip-install`

Copy signing secrets into root `.env` (see `.env.example`). Never commit `.p12`, `.jks`, or provision profiles.

## Day-to-day

| Goal | Command |
|------|---------|
| Desktop dev | `yarn tauri:dev` |
| Desktop release (mac universal) | `yarn build:mac` |
| Publish DMG + update Homebrew cask | `yarn build:mac 0.1.1 --publish` |
| …and commit/push the tap | `yarn build:mac 0.1.1 --publish --push-tap` |
| iOS simulator / device | `yarn tauri:ios:dev` |
| Android emulator / device | `yarn tauri:android:dev` |
| Regenerate icons | `yarn tauri:icon` |

## Homebrew

Cask token: `subspace-lattice` on [digital-defiance/homebrew-tap](https://github.com/Digital-Defiance/homebrew-tap).

```bash
brew install --cask digital-defiance/tap/subspace-lattice
```

Release asset name must match the cask URL: `Subspace_Lattice_<version>_universal.dmg`.
Set `HOMEBREW_TAP_DIR` (e.g. `/Volumes/Code/homebrew-tap`) before `--publish`.
First-time: commit the untracked `Casks/subspace-lattice.rb` in the tap repo, then push.

## Store builds

| Store | Command | Needs |
|-------|---------|--------|
| Mac App Store `.pkg` | `yarn build:macos-appstore` | Team ID, MAS profile, Distribution certs |
| iOS App Store `.ipa` | `yarn build:ios-appstore` | Team ID, iOS profile + `.p12` |
| Google Play `.aab` | `yarn build:android` | Upload keystore under `apps/desktop/src-tauri/` |

Optional: `yarn build:ios-appstore --upload` / `yarn build:macos-appstore --upload` with App Store Connect API key vars.

## Env loader

Scripts source `scripts/lib/lattice-env.sh` (shim over `subspace-env.sh`). Precedence: process ENV → `.env.local` → `.env`.

Default bundle id: `org.digitaldefiance.app.subspacelattice` (matches Homebrew `zap` paths).
