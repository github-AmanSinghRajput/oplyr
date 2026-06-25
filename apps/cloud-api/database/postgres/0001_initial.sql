CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS beta_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  role TEXT,
  company TEXT,
  use_case TEXT,
  source TEXT NOT NULL DEFAULT 'website',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS beta_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  lead_id UUID REFERENCES beta_leads(id) ON DELETE SET NULL,
  release_channel TEXT NOT NULL DEFAULT 'beta',
  status TEXT NOT NULL DEFAULT 'active',
  max_uses INTEGER NOT NULL DEFAULT 1,
  use_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL DEFAULT 'beta',
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  dmg_url TEXT NOT NULL,
  minimum_supported_version TEXT,
  published BOOLEAN NOT NULL DEFAULT TRUE,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (channel, version)
);

CREATE TABLE IF NOT EXISTS app_download_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES beta_leads(id) ON DELETE SET NULL,
  invite_id UUID REFERENCES beta_invites(id) ON DELETE SET NULL,
  release_id UUID REFERENCES app_releases(id) ON DELETE SET NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_installs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  install_id TEXT NOT NULL UNIQUE,
  lead_id UUID REFERENCES beta_leads(id) ON DELETE SET NULL,
  invite_id UUID REFERENCES beta_invites(id) ON DELETE SET NULL,
  release_channel TEXT NOT NULL DEFAULT 'beta',
  app_version TEXT,
  os_version TEXT,
  os_arch TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  install_id TEXT,
  email TEXT,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_beta_invites_lead_id ON beta_invites (lead_id);
CREATE INDEX IF NOT EXISTS idx_app_releases_channel_published_at ON app_releases (channel, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_download_events_created_at ON app_download_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_installs_last_seen_at ON app_installs (last_seen_at DESC);
