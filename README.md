# Playlist Syncer

Playlist Syncer is a **local web dashboard** for keeping **YouTube playlists and channels** in sync with a folder on your machine. You add a playlist or channel URL; the app inspects it, remembers every video it sees, and uses **yt-dlp** to download new items while skipping files you already have.

## What problem it solves

YouTube lists change over time—new uploads, privated or deleted videos, playlist edits. Playlist Syncer gives you one place to:

- See the current list (titles, availability, order where it applies).
- Track which entries were successfully downloaded, failed, or never attempted.
- Spot entries that disappeared from the source after you last synced.
- Re-run syncs on demand or on a schedule, with a readable log per job.

Everything is oriented around **your disk**: media and app bookkeeping live under `~/playlist-syncer`, with per-source folders and download-archive files so repeat syncs do not re-fetch completed videos.

## How it behaves

1. **Sources** — Each source is either a playlist or a channel, identified from the URL you paste. The app normalizes the URL and stores metadata (title, paths, last sync outcome).

2. **Catalog** — On each sync, the app refreshes a snapshot of the playlist or channel. That snapshot is stored as **videos** linked to the source, including unavailable entries (so you know something broke or was removed upstream).

3. **Downloads** — Sync jobs invoke yt-dlp with a download archive: new videos are fetched into the source’s output directory; existing archive entries are left alone. Job records capture status, counts, and truncated logs for the UI.

4. **Automation** — Optionally, the app can run periodic syncs at a configured interval, in addition to manual sync and sync at app startup.

In short, Playlist Syncer is a **small operator console** for “mirror these YouTube lists locally and show me honest status,” not a music streaming bridge or a hosted service.
