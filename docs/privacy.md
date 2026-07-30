# Privacy Policy

**Last updated:** July 30, 2026

Subspace Lattice ("the app," "we," "us") is operated by **Digital Defiance**. This policy describes how information is handled when you use the Subspace Lattice website, native apps (Tauri on macOS, iOS, Android, and Windows), and related Firebase-hosted URLs at [https://lattice.iwgf.org](https://lattice.iwgf.org).

---

## Summary

- **Local play** (local AI, pass-and-play, and the academy tutorial) runs on your device. We do not receive gameplay data from local-only sessions.
- **Online matchmaking** uses Google Firebase for anonymous sign-in and real-time multiplayer sync.
- We do **not** sell personal information, run advertising, or use third-party analytics SDKs in the app.
- Online seats use a **Federation call sign** (and optional match-only override); we do not collect email, phone, or payment information for anonymous play (optional Google or Apple sign-in for TEI / verified play may associate an email with your account).
- **Online Lattice is a public game service, not a private messenger.** There is no expectation of privacy in room chat, match logs, or other online activity. Administrators and moderators may monitor any part of the service.

---

## Information we collect

### Local play (no online room)

When you use **local AI**, **pass-and-play**, or the **tutorial**, game state stays in your browser or app. We do not transmit your board, moves, or scores to our servers for those modes. Optional TEI reporting after a signed-in **stock** local AI match is an explicit server write of match outcome only — not a live stream of your plies.

### Online rooms (Firebase)

When you create or join an **online room**, the app uses **Firebase Authentication** to create an **anonymous account** (a random user ID). We do not ask for your name, email, or password for anonymous play. Optional Google or Apple sign-in may link an email for leaderboard / TEI features.

For multiplayer sessions we store and sync:

| Data | Purpose |
| --- | --- |
| Anonymous user ID (and optional Google or Apple account link) | Identify your seat and enforce game security rules |
| Call sign / display name for the match | Show your name to other players in the lobby and room |
| Public game state | Board, pieces, turn order, rules modules, room settings, and other shared match data |
| Room chat | Messages sent during online play — retained with the room for gameplay and moderation |
| Coach / presence signals | Optional tactical-advisor requests visible to seated captains during active play |
| Spectator gallery flags | Whether observers may watch; spectator join when allowed |
| Timestamps | When rooms and related documents were created or updated |
| TEI / rating events (when eligible) | Record rated or local-AI results in the Lattice TEI pool |

Subspace Lattice is a **perfect-information** board game: both sides see the full board. There is no private “hand” document analogous to Warp Dominoes.

Room documents remain in Firestore until the match ends and data is cleaned up through normal gameplay or operational retention. We do not guarantee indefinite retention.

### Device storage

The app may store small preferences in your browser or app **local storage**, including:

- Sound mute preference
- Piece art style and outline preference
- Game log LPGN display toggle
- Tutorial progress

Match export files (for example **LPGN** or debug JSON) you save are created on your device; we do not upload them unless you choose to share them yourself.

This preference data never leaves your device unless you clear site or app storage.

---

## How we use information

We use the information above only to:

- Operate online multiplayer (room codes, move sync, win detection)
- Enforce Firestore security rules and prevent unauthorized changes
- Update Lattice TEI / standings when a match is eligible
- Improve stability and fix bugs when investigating reported issues
- Moderate the service (abuse, cheating, harassment, and related safety work)

We do **not** use your data for advertising, profiling, or marketing.

---

## No expectation of privacy (online play)

Lattice’s online features are a **multiplayer game**, not an encrypted chat product. By using online rooms you acknowledge that:

- **Room chat and the public match state are visible** to seated players and may be visible to spectators when the gallery is open. Treat chat as a public forum for that match.
- Chat is stored on our servers, is **not end-to-end encrypted**, and **Lattice / IWGF administrators and moderators may read it** when investigating reports or operating the service.
- Hidden information in the rules sense (for example, upcoming AI search) is a gameplay or client concern, not a privacy guarantee against operators.

**Administrators and moderators reserve the right to monitor all aspects of the online service** — including gameplay, chat, presence, ratings, and related account data — to keep the game fair and usable. Do not use Subspace Lattice as a general-purpose chatting site or for any activity that requires confidentiality.

---

## Third-party services

Online play relies on **Google Firebase** (Authentication, Cloud Firestore, Cloud Functions, Hosting), operated by Google LLC. Firebase processes data on our behalf according to [Google's privacy policy](https://policies.google.com/privacy) and [Firebase terms](https://firebase.google.com/terms). Optional **Sign in with Apple** is provided by Apple Inc.; Apple may share a name and/or email with Firebase according to [Apple's privacy policy](https://www.apple.com/legal/privacy/).

Federation standings and profile surfaces at [iwgf.org](https://iwgf.org) / [profile.iwgf.org](https://profile.iwgf.org) are shared IWGF products; they use the same Firebase project and identity model.

When you use online play, your data is stored in Firebase infrastructure. We do not share game data with other third parties except as needed to operate Firebase / Google infrastructure or as required by law.

---

## What we do not collect

- Phone numbers or contacts
- Precise location
- Payment or billing information (the app is free)
- Analytics or crash-reporting SDK data (we do not initialize Firebase Analytics or Crashlytics in the client)

Standard web hosting and Firebase may log technical metadata (such as IP address, user agent, and request timestamps) for security and operations. We may use those signals for abuse prevention (for example, bans); we do not use those logs to identify individual players for marketing.

---

## Children's privacy

Subspace Lattice is a strategy game intended for general audiences. We do not knowingly collect personal information from children under 13. If you believe a child has provided personal information through online play, contact us (see below) and we will take reasonable steps to delete associated room or account data where feasible.

---

## Your choices

- **Local only:** Play local AI, pass-and-play, or the tutorial without joining an online room to avoid server-side storage of live gameplay.
- **Call sign:** Prefer a non-identifying Federation call sign for online play.
- **Leave a room:** Players can exit a match; hosts control room lifecycle within the product.
- **Clear device data:** Remove local preferences by clearing site or app storage in your browser or device settings.

Anonymous Firebase accounts cannot be recovered if you clear app data or use a different device; you will receive a new anonymous ID.

---

## Security

We use Firebase security rules so clients can only read and write data appropriate to their role. Chat and board visibility in the client are gameplay controls, not encryption.

No method of transmission or storage is completely secure. Use online play at your own discretion.

---

## International users

Firebase may process and store data in the United States or other countries where Google operates infrastructure. By using online play, you consent to this processing for the purpose of providing the service.

---

## Changes to this policy

We may update this policy from time to time. The **Last updated** date at the top will change when we do. Continued use of the app after changes constitutes acceptance of the revised policy.

---

## Contact

Questions about this privacy policy or a data request:

- Open an issue on [GitHub — Digital-Defiance/subspace-lattice](https://github.com/Digital-Defiance/subspace-lattice/issues)
- Or contact the maintainer through the Digital Defiance project channels listed on that repository

---

## App store note

This page is available at **https://lattice.iwgf.org/privacy** for Google Play, Apple App Store, Microsoft Store, and other distribution listings that require a privacy policy URL.
