CREATE TABLE users (
  id TEXT PRIMARY KEY,
  family_email TEXT NOT NULL UNIQUE,
  personal_email TEXT NOT NULL DEFAULT '',
  full_name TEXT NOT NULL DEFAULT '',
  nickname TEXT NOT NULL DEFAULT '',
  date_of_birth TEXT NOT NULL DEFAULT '',
  residence TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  socials_json TEXT NOT NULL DEFAULT '[]',
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  onboarded INTEGER NOT NULL DEFAULT 0,
  avatar_key TEXT,
  preferences_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE site_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'update' CHECK (kind IN ('update', 'announcement')),
  body TEXT NOT NULL,
  media_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (author_id) REFERENCES users(id)
);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (post_id) REFERENCES posts(id),
  FOREIGN KEY (author_id) REFERENCES users(id)
);

CREATE TABLE reactions (
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (post_id, user_id, emoji),
  FOREIGN KEY (post_id) REFERENCES posts(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  due_at TEXT,
  audience TEXT NOT NULL DEFAULT 'self' CHECK (audience IN ('self', 'family')),
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (author_id) REFERENCES users(id)
);

CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  ingredients_json TEXT NOT NULL DEFAULT '[]',
  steps_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  media_json TEXT NOT NULL DEFAULT '[]',
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (author_id) REFERENCES users(id)
);

CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  display_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE gallery_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  album TEXT NOT NULL DEFAULT 'Family',
  media_key TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

CREATE TABLE change_log (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reverted_at TEXT,
  reverted_by TEXT
);

CREATE TABLE email_migrations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  old_email TEXT NOT NULL,
  new_email TEXT NOT NULL,
  migrated_by TEXT NOT NULL,
  migrated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_users_email ON users(family_email);
CREATE INDEX idx_posts_created ON posts(created_at DESC);
CREATE INDEX idx_comments_post ON comments(post_id, created_at);
CREATE INDEX idx_gallery_created ON gallery_items(created_at DESC);
CREATE INDEX idx_gallery_album ON gallery_items(album);
CREATE INDEX idx_change_log_created ON change_log(created_at DESC);
CREATE INDEX idx_reminders_due ON reminders(due_at);
CREATE INDEX idx_recipes_title ON recipes(title);

INSERT INTO site_settings (key, value_json, updated_at) VALUES
  (
    'banner',
    '{"title":"Welcome home","body":"The Winstead family space is live. Share a life update, add a recipe, or fill in the directory.","active":true}',
    datetime('now')
  ),
  (
    'family',
    '{"name":"Winstead","tagline":"Our people, our stories, our table."}',
    datetime('now')
  );
