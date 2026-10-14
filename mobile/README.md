# Mission Control — mobile app (Expo Go)

Android app that shows your Cursor agents and lets you create + prompt them,
through the bridge running on your Mac (see `../bridge` and `../SPEC.md`).

## Run it (no Android Studio)

1. Start the bridge on your Mac first (`cd ../bridge && npm start`). It prints a QR code.
2. On your phone, install **Expo Go** from the Play Store.
3. On your Mac:
   ```bash
   cd mobile
   npm install
   npx expo start
   ```
   The project targets **Expo SDK 57** — it needs the current Expo Go app
   (SDK 52-era Expo Go will refuse to open it).
4. Scan the **Expo QR** with Expo Go (same Wi-Fi), or use Tailscale on both devices
   and `npx expo start --tunnel`.
5. In the app, scan the **bridge QR** from step 1 (or enter URL + token manually).

## Connectivity (SPEC.md §5)

- Same Wi-Fi: works out of the box (bridge prints your LAN IP).
- From anywhere: install Tailscale on Mac + phone; the bridge prints your `100.x.y.z`
  address first — pair with that QR.
