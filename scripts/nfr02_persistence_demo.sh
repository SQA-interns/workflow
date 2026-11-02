#!/usr/bin/env bash
# NFR-02 runtime demonstration (not a test): data survives `docker compose down` and `up`.
# Creates a User, Workspace and Contact, recreates every container, signs in again and reads them back.
set -euo pipefail
cd "$(dirname "$0")/.."
BASE=http://localhost:8080
EMU=http://localhost:9099
KEY=demo-api-key
EMAIL="nfr02.$(date +%s)@example.si"
PASS=geslo-123456

json() { python3 -I -c "import json,sys; print(json.load(sys.stdin)$1)"; }
token() {
  curl -sf -X POST "$EMU/identitytoolkit.googleapis.com/v1/accounts:$1?key=$KEY" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"returnSecureToken\":true}" | json "['idToken']"
}

docker compose up -d --wait >/dev/null
T=$(token signUp)
curl -sf "$BASE/api/me" -H "Authorization: Bearer $T" >/dev/null
W=$(curl -sf -X POST "$BASE/api/workspaces" -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"name":"Obstojnost"}' | json "['id']")
C=$(curl -sf -X POST "$BASE/api/workspaces/$W/contacts" -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  -d '{"firstName":"Trajna","lastName":"Žabjek","tags":["ostane"]}' | json "['id']")
echo "Created Workspace $W and Contact $C for $EMAIL"

echo "Recreating all containers (docker compose down && docker compose up) ..."
docker compose down >/dev/null 2>&1
docker compose up -d --wait >/dev/null 2>&1

T=$(token signInWithPassword)
NAME=$(curl -sf "$BASE/api/workspaces/$W/contacts/$C" -H "Authorization: Bearer $T" | json "['lastName']")
REVS=$(curl -sf "$BASE/api/workspaces/$W/contacts/$C/revisions" -H "Authorization: Bearer $T" | json ".__len__()")
if [ "$NAME" = "Žabjek" ] && [ "$REVS" = "1" ]; then
  echo "NFR-02 met: the User signs in again and the Contact ($NAME) and its Revision are still there."
else
  echo "NFR-02 NOT met (lastName=$NAME, revisions=$REVS)"; exit 1
fi
