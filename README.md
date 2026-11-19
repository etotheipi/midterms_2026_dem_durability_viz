# Senate Scenarios

A standalone static web app comparing Democratic and Republican U.S. Senate seat totals under simplified vote-margin scenarios. It uses the post-2026 seat composition and the election schedule through 2032. These are illustrative calculations, not predictions or probabilities.

Source repository: [etotheipi/midterms_2026_dem_durability_viz](https://github.com/etotheipi/midterms_2026_dem_durability_viz).

## Run

Run locally with Python 3. No dependency installation, application build, account, API key, or ChatGPT service is required.

```sh
python3 serve.py
```

Open http://127.0.0.1:4173/. Stop the server with Ctrl+C. The command works from any working directory if you pass the path to `serve.py`.

To use a different port:

```sh
python3 serve.py --port 8080
```

`npm start` and `npm run dev` are equivalent shortcuts. Node 22+ is only needed for the JavaScript checks:

```sh
npm test
```

`node scripts/browser-check.mjs` also checks the UI through Chrome's DevTools protocol while the preview server is running. It uses a temporary Chrome profile and writes screenshots to `/tmp/senate-durability-qa/`. Set `BASE_URL` to test another origin or a GitHub Pages-style repository subdirectory.

## GitHub Pages

The app runs entirely in the browser. GitHub Pages publishes the checked-in `docs/` directory, which contains a copy of the local server's `dist/` files. All app asset paths are relative and work under a repository subdirectory URL.

Published app: [Senate Scenarios](https://etotheipi.github.io/midterms_2026_dem_durability_viz/).

To publish changes:

```sh
python3 scripts/prepare-pages.py
git add dist docs
git commit -m "Update Senate scenarios"
git push
```

`npm run build:pages` is an equivalent shortcut for preparing `docs/`. GitHub Pages is configured to deploy from `main`, directory `/docs`, without a custom Actions workflow or additional credentials. For another repository, select **Settings → Pages → Build and deployment → Deploy from a branch → main → /docs**. See [GitHub's publishing-source documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

The app can also run locally or on another static host using `dist/`.

## Controls

- 2028 is always included. The 2030 switch defaults on; the 2032 switch defaults off.
- Switch later years off to gray out their columns and remove their outcomes from the summary. Their selections are retained when switched back on.
- A later election needs the earlier elections to be enabled and selected. Turning 2030 off also blocks 2032 so it cannot silently use an unspecified 2030 result.
- Click any row, drag a handle, or enter a number. Keyboard sliders support arrow keys, Page Up/Down, Home and End.
- Positive labels are dark blue and negative labels dark red. The shared direction key points toward stronger Democratic or Republican performance.
- The 2026 waterline is labeled **Same as 2026**. In uniform-shift mode, **2024 (approx)** marks −14 points using the original rough national-shift assumption; this is a visual reference and does not change the model. In interpolation mode, 0% reproduces each state's actual 2024 baseline.

## Model

- Start with 56 Democratic caucus seats (including King and Sanders), 44 Republican seats.
- In 2028 replace Class III seats; in 2030 replace Class I; in 2032 replace Class II.
- Carry all other seat outcomes forward. Every performance setting still refers to the fixed historical state baselines, not the preceding election's margin.
- Alaska's Class III seat is fixed Republican in 2028. Alaska's Class II seat is modeled normally in 2032.
- The expected 2028 Tennessee special for the Class I seat is included by default and can be disabled. That same seat is contested again in 2030. Unknown future specials are omitted.
- A zero margin is an unresolved tie. 51 seats are required for an outright majority; no future vice-presidential party is assumed.
- Uniform mode uses `margin2026 + shift`, from −25 through +10 margin points.
- Interpolation uses `margin2024 + percentage/100 * (margin2026 - margin2024)`, from −50% to 150%, adjustable by 1%. Displayed rows are spaced every 5%.
- The two modes retain separate selections. URL parameters preserve the current mode, sequential selections, enabled years, and Tennessee setting for sharing or reloading. Older links containing a 2032 selection still enable that year.

For each historical year, use the Senate margin when available, otherwise the aggregate of Democratic and Republican House votes. Regular full-term Senate results take priority over simultaneous special elections. Senate margins use the leading Democratic-side candidate minus the leading Republican as a share of votes cast. House fallback margins use `(D - R) / (D + R) * 100`, including unopposed and same-party races; those races can distort the fallback. New York fusion lines are combined with their candidates in the 2024 snapshot.

Opposition independents are explicit proxies in the margin inputs: King and Sanders in 2024; Osborn in 2024 and 2026; Bodnar, Achilles and Bengs in 2026. In Montana, Bodnar is the main non-Republican candidate and supplies the margin even though a Democratic candidate also ran. This convention does not imply these candidates would join the Democratic caucus.

For example, a margin shift of −7 points in 2028 gives 57 D / 43 R seats. A subsequent setting of −15 in 2030 gives 52 D / 48 R. Continuing at −15 in 2032 gives 42 D / 58 R, as the regular 2026 seats return to the ballot. Each setting is relative to 2026. These are arithmetic scenarios, not probabilities or forecasts.

## Data and reproducibility

The app uses a frozen snapshot dated November 18, 2026. Counts are provisional. It makes no requests for election data beyond loading its bundled JSON.

- `data/source2024.json`: parsed candidate returns from the [House Clerk's official 2024 statistics](https://history.house.gov/Institution/Election-Statistics/2024election/), published March 10, 2025. Includes identified party write-ins and fusion-line votes.
- `data/source2026.json`: Senate candidates, all House summary records, and complete candidate lists for every House district used in a fallback state. From [Call the Map](https://www.callthemap.com/results), compiled from state and county election offices. Each full race record preserves its source URL and update time.
- `dist/election-data.json`: the 50-state baselines and 100-seat roster used by the browser.
- [Senate class rosters](https://www.senate.gov/senators/Class_III.htm) supply the election schedule; the 2026 Ohio and Florida special winners are assigned Class III.
- [Ballotpedia's 2026 Senate results](https://ballotpedia.org/Election_results,_2026:_U.S._Senate) verify the starting 56–44 caucus.
- [AP reporting](https://apnews.com/article/bfe5baf0dd3f26ddf0ca9b844400515d) supports the expected Tennessee special election.

Rebuild the browser dataset from the checked-in snapshots:

```sh
npm run build:data
```

Refreshing 2026 counts changes the snapshot and requires network access:

```sh
python3 scripts/acquire-data.py
python3 scripts/build-data.py
npm test
```

The data acquisition script caches public HTML in `/tmp/senate-durability-data/`. Remove that task cache to force fresh downloads. Update the snapshot date in the data generator and UI when changing its date. The browser exposes source links for each state's inputs and a CSV export of all 50 baselines.
