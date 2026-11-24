# FreshTube — YouTube Recency Filter (Chrome/Brave Browser Extension)

FreshTube hides YouTube video recommendations older than your chosen age limit (default: **1 week**). You can customize the limit to any number of **hours, days, weeks, months, or years**, and choose which YouTube feeds to filter.

<img width="320" height="503" alt="image" src="https://github.com/user-attachments/assets/a1e91e04-8204-474a-ad90-b130067beee7" />

## How to Install in Brave

1. Unzip `freshtube-brave-extension.zip` into a permanent folder on your computer.
2. Open Brave and go to `brave://extensions`.
3. Turn on **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the unzipped `freshtube-extension` folder (the folder containing `manifest.json`).
5. Pin **FreshTube** from the puzzle-piece extensions menu in the toolbar, then open or reload YouTube.

## Features

- **Customizable age threshold**: Pick a quick preset (`24h`, `3d`, `1w`, `2w`, `1mo`, `3mo`, `1y`) or enter any custom value and unit.
- **Selective feed scopes**: Enabled by default on the **Home feed** and **Watch page sidebar ("Up next")**; optionally enable for **Subscriptions**, **Search results**, or **Channel pages**.
- **Live & Premiere safe**: Keeps active livestreams and upcoming premieres visible by default.
- **Non-destructive filtering**: Uses CSS attribute hiding (`data-freshtube-hidden`) so YouTube's infinite scroll and SPA navigation continue to work smoothly.
- **Privacy-first**: Runs 100% locally in your browser with only the `storage` permission—no external network requests or tracking.
