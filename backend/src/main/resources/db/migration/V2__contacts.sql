CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE contacts (
  id            UUID PRIMARY KEY,
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  version       INTEGER NOT NULL,
  deleted       BOOLEAN NOT NULL DEFAULT FALSE,
  merged_into   UUID,
  first_name    VARCHAR(100),
  last_name     VARCHAR(100),
  email         VARCHAR(254),
  phone         VARCHAR(50),
  company       VARCHAR(200),
  job_title     VARCHAR(200),
  street        VARCHAR(200),
  postal_code   VARCHAR(20),
  city          VARCHAR(100),
  country       VARCHAR(2),
  note          VARCHAR(2000),
  search_text   TEXT NOT NULL DEFAULT '',
  email_norm    VARCHAR(254),
  phone_norm    VARCHAR(60),
  name_norm     VARCHAR(210),
  sort_last     VARCHAR(100),
  sort_first    VARCHAR(100),
  sort_company  VARCHAR(200),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX contacts_ws_active ON contacts (workspace_id, deleted, sort_last, sort_first, id);
CREATE INDEX contacts_ws_updated ON contacts (workspace_id, deleted, updated_at);
CREATE INDEX contacts_email_norm ON contacts (workspace_id, email_norm) WHERE NOT deleted;
CREATE INDEX contacts_phone_norm ON contacts (workspace_id, phone_norm) WHERE NOT deleted;
CREATE INDEX contacts_name_norm ON contacts (workspace_id, name_norm) WHERE NOT deleted;
CREATE INDEX contacts_search_trgm ON contacts USING gin (search_text gin_trgm_ops);

CREATE TABLE contact_attributes (
  contact_id  UUID NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  key         VARCHAR(50) NOT NULL,
  key_lower   VARCHAR(50) NOT NULL,
  value       VARCHAR(500) NOT NULL,
  PRIMARY KEY (contact_id, position),
  UNIQUE (contact_id, key_lower)
);
CREATE INDEX contact_attributes_key ON contact_attributes (key_lower, contact_id);

CREATE TABLE tags (
  id            UUID PRIMARY KEY,
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  name          VARCHAR(50) NOT NULL,
  name_lower    VARCHAR(50) NOT NULL,
  UNIQUE (workspace_id, name_lower)
);

CREATE TABLE contact_tags (
  contact_id  UUID NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
  tag_id      UUID NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  PRIMARY KEY (contact_id, tag_id)
);
CREATE INDEX contact_tags_tag ON contact_tags (tag_id, contact_id);

CREATE TABLE revisions (
  contact_id    UUID NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
  workspace_id  UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  number        INTEGER NOT NULL,
  type          VARCHAR(12) NOT NULL CHECK (type IN ('CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'MERGE', 'MERGED_AWAY')),
  author_id     UUID NOT NULL REFERENCES users (id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  state         JSONB NOT NULL,
  PRIMARY KEY (contact_id, number)
);

-- Revisions are immutable: only removal together with their Contact (purge, Workspace deletion) is allowed.
CREATE FUNCTION revisions_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'revisions are immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER revisions_no_update BEFORE UPDATE ON revisions FOR EACH ROW EXECUTE FUNCTION revisions_immutable();
