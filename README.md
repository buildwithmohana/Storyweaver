# Storyweaver — Bedtime Story App

A single-file, offline-capable mobile web app that generates a fresh bedtime
story every night, built around a child-chosen character and a parent-chosen
life lesson. Implemented from a Claude Design prototype using the Nocturne
design system.

## Run it

Open `index.html` in any modern browser. No build step, no dependencies.

## Features

- **Accounts** — create account / log in (validation-gated)
- **Story inputs** — character, curated lesson chips + custom lesson, optional
  length, one-off notes
- **Generation** — instant story with a "Quick peek" TLDR and large,
  night-friendly reading view
- **Favorite / Regenerate / Done** — regenerate a different variant, save on finish
- **Stories** — per-child history, favorites preserved
- **Profiles** — child detail editor (name, age, gender, standing preferences),
  delete-with-confirm, account & log out
- **Persistence** — account, profile, history, and favorites are stored in
  Supabase (Postgres + Auth) and sync across devices; uploaded avatars and
  covers live in a private Supabase Storage bucket (served via signed URLs)

## Structure

- `index.html` — the entire app (styles, iOS device frame, `image-slot`
  component, story engine, and UI logic all inlined)
