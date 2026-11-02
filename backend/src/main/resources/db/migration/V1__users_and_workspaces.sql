CREATE TABLE users (
  id            UUID PRIMARY KEY,
  firebase_uid  VARCHAR(128) NOT NULL UNIQUE,
  email         VARCHAR(320),
  email_lower   VARCHAR(320),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  display_name  VARCHAR(200),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX users_email_lower ON users (email_lower);

CREATE TABLE workspaces (
  id         UUID PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users (id),
  role         VARCHAR(10) NOT NULL CHECK (role IN ('OWNER', 'EDITOR', 'VIEWER')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX memberships_user ON memberships (user_id);

CREATE TABLE invitations (
  id           UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE,
  email        VARCHAR(320) NOT NULL,
  email_lower  VARCHAR(320) NOT NULL,
  role         VARCHAR(10) NOT NULL CHECK (role IN ('OWNER', 'EDITOR', 'VIEWER')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, email_lower)
);
CREATE INDEX invitations_email ON invitations (email_lower);
