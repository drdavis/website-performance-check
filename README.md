# Website Performance Check

A Chrome extension by **D3 Digital Media** that shows a quick organic SEO snapshot for whatever website you are on:

- Organic keyword count and month-over-month change
- Estimated organic monthly traffic, with a 12-month trend chart
- An overall 0–100 score
- An optional one-line AI verdict with opportunities

Data comes from [DataForSEO](https://dataforseo.com). The AI verdict is optional and uses [OpenRouter](https://openrouter.ai).

---

## What you need

1. **Google Chrome** (or another Chromium browser: Edge, Brave, Arc).
2. **A DataForSEO account** (required). Sign up at dataforseo.com, then open the dashboard → **API Access** to find your API login and API password. DataForSEO is pay-as-you-go: each check runs two small API requests that are billed to your account.
3. **An OpenRouter API key** (optional). Only needed if you want the AI verdict. Create one at openrouter.ai → **Keys**. Usage is billed to your OpenRouter account.

Use your own accounts. Do not share API credentials with other people.

---

## Install

The extension isn't in the Chrome Web Store, so you load it directly from its folder.

1. **Get the files.** Unzip the `website-performance-check.zip` you were sent (or clone the repository) to a folder you will keep, for example `Documents/website-performance-check`. Chrome loads the extension from that folder every time, so don't delete or move it later.
2. **Open the extensions page.** In Chrome, go to `chrome://extensions`.
3. **Turn on Developer mode** using the toggle in the top-right corner.
4. **Click "Load unpacked"** and select the folder from step 1. That's the folder that contains `manifest.json`.
5. **Pin it** (optional). Click the puzzle-piece icon in the toolbar, then the pin next to *Website Performance Check*.

## Set up

1. Click the extension icon. The side panel opens.
2. Click **Open Settings** (or the ⚙ button).
3. Enter your **DataForSEO API login** and **API password**.
4. Optional: paste your **OpenRouter API key** to turn on the AI verdict. You can also change the model, which defaults to a fast Claude Haiku model.
5. Optional: change the **location code** (default `2840`, United States) and the **language code** (default `en`). DataForSEO lists the other location codes in its docs.
6. Click **Save**.

## Use

1. Open any website in a tab.
2. Click the extension icon. The side panel analyzes the site's domain.
3. When you switch to another site, click **↻** to refresh.

---

## Privacy and security

- Your API credentials are stored only in your browser's local extension storage on your computer. They are never sent anywhere except DataForSEO and OpenRouter.
- When you run a check, the extension sends the **domain name** of the current tab (for example `example.com`), never the full URL, to DataForSEO, and to OpenRouter if the AI verdict is turned on. Nothing else about your browsing is collected or sent.
- The extension has no server of its own, no analytics, and no tracking.
- Permissions it asks for:
  - **tabs**: to read the address of the active tab.
  - **storage**: to save your settings.
  - **sidePanel**: to show the panel.
  - **Network access to `api.dataforseo.com` and `openrouter.ai` only.**
- Browser extension storage isn't encrypted. Don't install this on a shared or public computer with your keys saved.

## Troubleshooting

| Message | Fix |
|---|---|
| "Add your DataForSEO credentials to get started." | Open Settings and enter your login and password. |
| "DataForSEO HTTP 401" | The login or password is wrong. Copy both again from the DataForSEO dashboard. |
| "DataForSEO HTTP 402" or a balance error | Your DataForSEO account needs funds. |
| "No organic data found for this domain." | DataForSEO has no ranking data for the site. This is common for very new or very small sites. |
| "Navigate to a website to analyze it." | The current tab isn't a normal website (for example a `chrome://` page or a new tab). |
| No AI verdict shown | The OpenRouter key is missing or invalid, or the request timed out. The rest of the panel still works. |

To update to a newer version: replace the folder's contents with the new files, then click the reload icon on the extension's card at `chrome://extensions`.

---

## For maintainers

```bash
npm test
```

To build a shareable zip of the committed files (personal settings stay out of it):

```bash
git archive --format=zip --prefix=website-performance-check/ -o website-performance-check.zip HEAD
```

---

## Credits

Built by **D3 Digital Media**. © 2026 D3 Digital Media. Released under the MIT License (see `LICENSE`). Any copy or modified version must keep this copyright notice.
