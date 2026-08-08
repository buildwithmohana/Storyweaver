# Storyweaver — Supabase setup

This wires the app to a real cloud database so accounts, child profiles, saved
stories, favorites, and uploaded images sync across devices instead of living
in one browser's `localStorage`.

You do these steps once, in your own Supabase account.

---

## 1. Create a Supabase project

1. Go to https://supabase.com and sign in (free tier is plenty).
2. **New project** → give it a name (e.g. `storyweaver`), set a database
   password, pick a region close to you, and create it.
3. Wait ~2 minutes for it to provision.

## 2. Create the tables, policies, and storage

1. In the project, open **SQL Editor** → **New query**.
2. Paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql).
3. Click **Run**. You should see "Success. No rows returned."

This creates the `children` and `stories` tables, Row Level Security so each
parent can only see their own data, and a private `story-images` storage bucket
for avatars and covers.

## 3. Enable email/password auth

1. Open **Authentication** → **Providers** → **Email**.
2. Make sure **Email** is enabled.
3. For easy testing, you may want to turn **Confirm email** *off* while
   developing (Authentication → Providers → Email → "Confirm email"). Turn it
   back on before real users sign up.

## 4. Get your API keys

1. Open **Project Settings** → **API**.
2. Copy the **Project URL** (looks like `https://abcd1234.supabase.co`).
3. Copy the **anon public** key (a long JWT).

The anon key is meant to be shipped in the browser — it is *not* a secret.
Your data is protected by the Row Level Security policies from step 2, not by
hiding the key. (Never put the **service_role** key in the frontend.)

## 5. Plug the keys into the app

Open [`js/db.js`](js/db.js) and replace the two placeholders at the top:

```js
var SUPABASE_URL      = 'https://YOUR-PROJECT-ref.supabase.co';
var SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';
```

with the values from step 4.

## 6. Load the client in the page

The data layer needs the Supabase JS client loaded first. In `index.html`,
before the app's own script, add:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="js/db.js"></script>
```

> Note: this pulls the client from a CDN, so the app now needs an internet
> connection (fine for GitHub Pages; it means it's no longer fully offline).

---

## What's in the database

| Table                | Holds                                                            |
| -------------------- | --------------------------------------------------------------- |
| `auth.users`         | parent accounts (managed by Supabase Auth)                      |
| `public.children`    | child profiles: name, age, gender, preferences, avatar         |
| `public.stories`     | generated stories: character, lesson, tldr, body, favorite     |
| storage `story-images` | uploaded avatars and story covers (private, per-user folder)  |

Every row carries a `user_id`, and RLS guarantees a signed-in parent can only
read or modify rows where `user_id = auth.uid()`.

## Using the data layer

`js/db.js` exposes a global `DB` object:

```js
await DB.auth.signUp(email, password);
await DB.auth.signIn(email, password);
await DB.auth.signOut();

const kids    = await DB.children.list();
const child   = await DB.children.create({ name: 'Mira', age: 4, gender: 'Girl', preferences: '…' });
await DB.children.update(child.id, { preferences: '…' });
await DB.children.remove(child.id);         // cascades: also deletes their stories

const stories = await DB.stories.list(child.id);
const story   = await DB.stories.create({ childId: child.id, character, lesson, tldr, body });
await DB.stories.setFavorite(story.id, true);

const path    = await DB.images.upload(fileBlob, 'avatar.png');
const url      = await DB.images.signedUrl(path);   // temporary URL for <img src>
```

## Images

Avatars and story covers upload to the private `story-images` bucket and are
displayed via short-lived signed URLs. In `index.html`, the `<image-slot>`
component talks to a small `window.ImageSlotBackend` adapter that maps:

- `avatar-*` slots → `children.avatar_url`
- `cover-<storyId>` slots → `stories.cover_url`

Files are stored under `<user_id>/<timestamp>-<name>`, which the Storage RLS
policies restrict to the owning user. If no backend is present (e.g. the client
failed to load), the component falls back to `localStorage` so it still works.

## Status

The app is fully wired to Supabase: real email/password auth with session
restore, cloud-synced child profiles and stories, favorites, and image uploads.
`localStorage` is now only a fallback for the image component.
