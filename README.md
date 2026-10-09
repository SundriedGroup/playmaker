# Playmaker

Live Instagram scorecard for @garethmarshall.

One password-protected page with live numbers from the Meta Graph API:

- Followers, and new followers per day for the last 30 days
- This week vs last week: posts, reach, shares, saves, follows
- The target: one post over 1,000 reach a week
- Average reach by series (Business Athlete, Road to 21km, More Life, Coastal)
- Audience: age, gender, top countries and top cities, for your followers or for the people who engaged this month
- The latest 15 posts with reach, views, shares, saves, follows, comments, likes and average watch time for reels

No build step and no dependencies: one HTML page (`index.html`) and one Vercel function (`api/dashboard.js`). Your Meta token stays on the server and never reaches the browser.

## Deploy on Vercel

1. In Vercel: **Add New → Project**, import this GitHub repo. Framework preset: **Other**. Leave build settings empty.
2. Before deploying, add these under **Settings → Environment Variables**:

| Name | Value |
|---|---|
| `META_ACCESS_TOKEN` | Your Meta token. A system user token from Business Manager is best because it doesn't expire. |
| `IG_USER_ID` | Optional. Your Instagram account ID (the long number, not the handle). If it is missing, or is your Facebook Page ID by mistake, Playmaker finds the linked Instagram account itself. |
| `DASHBOARD_PASSWORD` | Any password. You'll type it once per device. |
| `MOCK` | `0` for live data. Set `1` to see sample data. |

For daily history in Supabase (the "Road to 10k" chart):

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://dxhqiwgbzvujirgvuzrt.supabase.co` (the Playmaker project) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → a **secret key** (`sb_secret_…`), or the legacy **service_role** key. Either works. Server only; never put it in the page. |
| `CRON_SECRET` | Any long random string. Vercel sends it with the daily snapshot call so no one else can trigger it. |

Optional: `META_GRAPH_VERSION` (default `v23.0`), `POST_LIMIT` (default `15`, max `50`), `FOLLOWER_GOAL` (default `10000`).

3. Deploy, open the URL, enter the password.

## What your Meta app needs

- An Instagram **Creator or Business** account
- If you use Facebook Login (token starts with `EAA`): the account linked to a Facebook Page, and the permissions `instagram_basic`, `instagram_manage_insights` and `pages_read_engagement`
- If you use Instagram Login (token starts with `IG`): `instagram_business_basic` and `instagram_business_manage_insights`
- Messages permissions are **not** needed. Leave them off this token.

To find `IG_USER_ID` with a Facebook-login token, open the Graph API Explorer and run:
`me/accounts?fields=instagram_business_account` — the `id` inside `instagram_business_account` is the one.

## When something breaks

- **"Your Meta access token has expired"**: make a new token and update `META_ACCESS_TOKEN` in Vercel, then redeploy. Long-lived user tokens last about 60 days; system user tokens don't expire.
- **A metric shows "—"**: Meta doesn't provide it for that post type (for example, follows on reels), or the post is too new.
- **No follower chart**: Meta needs 100+ followers and the insights permission.

## Plan tab (content calendar)

The **Plan** tab is the content calendar, stored in Supabase (`public.content`, copied from the Notion Content Calendar on 9 Oct 2026).

- One week at a time, Monday to Sunday, with today highlighted. Parked and undated items sit at the bottom.
- Change a post's stage from the dropdown (Idea → Scripted → Filmed → Edited → Scheduled → Posted, or Parked).
- Open a post to read the script and caption, **Copy caption**, or **Edit** the title, date, opening line, script, caption and notes.
- **+ Idea** adds a new row from anywhere, including your phone.
- When a planned post goes live, Playmaker matches it to the Instagram post (same day, similar opening line) and shows its reach, views, shares, saves and follows on the card.
- API: `GET /api/content`, `POST /api/content`, `PATCH /api/content?id=…`, all behind the same password.

## Daily snapshots (Supabase)

- Vercel Cron calls `/api/snapshot` every day at 06:00 SAST (`vercel.json`). It saves your follower count and each recent post's numbers.
- Tables: `account_snapshots` (one row a day) and `post_snapshots` (one row per post per day). The SQL is in `supabase/schema.sql` and has already been applied to the Playmaker project.
- Row-level security is on with no policies, so the public key can't read or write either table. Only the server, with the service role key, can.
- Supabase's security advisor will show an info notice, "RLS enabled, no policy". That's expected for this setup.
- To trigger a snapshot by hand: `curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>.vercel.app/api/snapshot`

## Changing the series tags

Posts are tagged by words in the caption. Edit `SERIES_RULES` in `lib/instagram.js`. "More life. Less excuses." is in every caption, so it isn't used as a rule.

## Audience data

Uses Meta's `follower_demographics` and `engaged_audience_demographics` (this month). Meta needs at least 100 followers, returns the top 45 values per breakdown, and needs the insights permission on your token (`instagram_manage_insights`, or `instagram_business_manage_insights` with Instagram Login). If a breakdown isn't available the page says so instead of failing.

## Not available from Meta's API

The 3-second view rate and skip rate shown in the Instagram app aren't exposed through the API. Check those in the app.

## Test locally

```
MOCK=1 DASHBOARD_PASSWORD=test npx vercel dev
```
