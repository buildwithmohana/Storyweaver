/* ============================================================================
 * Storyweaver — Supabase data-access layer
 * ----------------------------------------------------------------------------
 * Load AFTER the Supabase UMD client, which exposes `window.supabase`:
 *
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *   <script src="js/db.js"></script>
 *
 * Then use the global `DB` object. Every method returns a Promise and throws
 * on error, so wrap calls in try/catch (or .catch()).
 *
 * Fill in your project's URL and anon key below (Supabase Dashboard →
 * Project Settings → API). The anon key is safe to ship in the browser —
 * Row Level Security (see supabase/schema.sql) is what protects the data.
 * ========================================================================== */
(function (global) {
  'use strict';

  // --- Configuration --------------------------------------------------------
  var SUPABASE_URL = 'https://gunqtnjyymgstxkwwyhl.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_wKVJe9NblaNO_GsAIZ0wGw_-KjYBjWL';

  if (!global.supabase || !global.supabase.createClient) {
    throw new Error('[DB] Supabase client not found. Load @supabase/supabase-js before db.js.');
  }

  var client = global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });

  var BUCKET = 'story-images';

  // --- Mappers: DB row  <->  app shape --------------------------------------
  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (e) { return ''; }
  }

  // stories row -> the story object the UI already uses
  function toStory(row) {
    return {
      id: row.id,
      character: row.character,
      lesson: row.lesson,
      bankIndex: row.bank_index,
      tldr: Array.isArray(row.tldr) ? row.tldr : [],
      body: row.body,
      favorite: !!row.favorite,
      coverUrl: row.cover_url || null,
      date: fmtDate(row.created_at),
      createdAt: row.created_at
    };
  }

  // children row -> the profile object the UI already uses
  function toChild(row) {
    return {
      id: row.id,
      name: row.name,
      age: row.age,
      gender: row.gender,
      preferences: row.preferences,
      avatarUrl: row.avatar_url || null
    };
  }

  // --- Auth -----------------------------------------------------------------
  var auth = {
    async signUp(email, password) {
      var res = await client.auth.signUp({ email: email, password: password });
      if (res.error) throw res.error;
      return res.data;
    },
    async signIn(email, password) {
      var res = await client.auth.signInWithPassword({ email: email, password: password });
      if (res.error) throw res.error;
      return res.data;
    },
    async signOut() {
      var res = await client.auth.signOut();
      if (res.error) throw res.error;
    },
    async getUser() {
      var res = await client.auth.getUser();
      return res.data ? res.data.user : null;
    },
    async getSession() {
      var res = await client.auth.getSession();
      return res.data ? res.data.session : null;
    },
    // cb(user|null) fires on sign-in / sign-out / token refresh
    onChange(cb) {
      return client.auth.onAuthStateChange(function (_event, session) {
        cb(session ? session.user : null);
      });
    }
  };

  // --- Children (profiles) --------------------------------------------------
  var children = {
    async list() {
      var res = await client.from('children').select('*').order('created_at', { ascending: true });
      if (res.error) throw res.error;
      return res.data.map(toChild);
    },
    async create(profile) {
      var user = await auth.getUser();
      if (!user) throw new Error('Not signed in');
      var res = await client.from('children').insert({
        user_id: user.id,
        name: profile.name,
        age: profile.age !== '' && profile.age != null ? parseInt(profile.age, 10) : null,
        gender: profile.gender || null,
        preferences: profile.preferences || null,
        avatar_url: profile.avatarUrl || null
      }).select().single();
      if (res.error) throw res.error;
      return toChild(res.data);
    },
    async update(id, patch) {
      var row = {};
      if ('name' in patch) row.name = patch.name;
      if ('age' in patch) row.age = patch.age !== '' && patch.age != null ? parseInt(patch.age, 10) : null;
      if ('gender' in patch) row.gender = patch.gender;
      if ('preferences' in patch) row.preferences = patch.preferences;
      if ('avatarUrl' in patch) row.avatar_url = patch.avatarUrl;
      var res = await client.from('children').update(row).eq('id', id).select().single();
      if (res.error) throw res.error;
      return toChild(res.data);
    },
    async remove(id) {
      // stories cascade-delete via the FK, matching the app's delete-profile behavior
      var res = await client.from('children').delete().eq('id', id);
      if (res.error) throw res.error;
    }
  };

  // --- Stories --------------------------------------------------------------
  var stories = {
    async list(childId) {
      var q = client.from('stories').select('*').order('created_at', { ascending: false });
      if (childId) q = q.eq('child_id', childId);
      var res = await q;
      if (res.error) throw res.error;
      return res.data.map(toStory);
    },
    async create(story) {
      var user = await auth.getUser();
      if (!user) throw new Error('Not signed in');
      var res = await client.from('stories').insert({
        user_id: user.id,
        child_id: story.childId || null,
        character: story.character,
        lesson: story.lesson,
        bank_index: story.bankIndex || 0,
        tldr: story.tldr || [],
        body: story.body,
        favorite: !!story.favorite,
        cover_url: story.coverUrl || null
      }).select().single();
      if (res.error) throw res.error;
      return toStory(res.data);
    },
    async setFavorite(id, favorite) {
      var res = await client.from('stories').update({ favorite: !!favorite }).eq('id', id).select().single();
      if (res.error) throw res.error;
      return toStory(res.data);
    },
    async update(id, patch) {
      var row = {};
      if ('bankIndex' in patch) row.bank_index = patch.bankIndex;
      if ('tldr' in patch) row.tldr = patch.tldr;
      if ('body' in patch) row.body = patch.body;
      if ('favorite' in patch) row.favorite = !!patch.favorite;
      if ('coverUrl' in patch) row.cover_url = patch.coverUrl;
      var res = await client.from('stories').update(row).eq('id', id).select().single();
      if (res.error) throw res.error;
      return toStory(res.data);
    },
    async remove(id) {
      var res = await client.from('stories').delete().eq('id', id);
      if (res.error) throw res.error;
    }
  };

  // --- Images (private storage bucket) --------------------------------------
  var images = {
    // Upload a File/Blob; returns the storage path "<user_id>/<name>".
    async upload(fileOrBlob, name) {
      var user = await auth.getUser();
      if (!user) throw new Error('Not signed in');
      var path = user.id + '/' + Date.now() + '-' + (name || 'image');
      var res = await client.storage.from(BUCKET).upload(path, fileOrBlob, { upsert: true });
      if (res.error) throw res.error;
      return path;
    },
    // Private bucket -> generate a temporary signed URL for <img src>.
    async signedUrl(path, expiresInSeconds) {
      if (!path) return null;
      var res = await client.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds || 3600);
      if (res.error) throw res.error;
      return res.data.signedUrl;
    },
    async remove(path) {
      if (!path) return;
      var res = await client.storage.from(BUCKET).remove([path]);
      if (res.error) throw res.error;
    }
  };

  // --- Public API -----------------------------------------------------------
  global.DB = {
    client: client,
    auth: auth,
    children: children,
    stories: stories,
    images: images,
    _configured: function () {
      return SUPABASE_URL.indexOf('YOUR-PROJECT') === -1 && SUPABASE_ANON_KEY.indexOf('YOUR-ANON') === -1;
    }
  };
})(window);
