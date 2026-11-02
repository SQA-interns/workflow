#!/bin/sh
# Keeps emulator accounts across restarts so signed-up Users survive `docker compose down`/`up`.
# The export goes to a subdirectory: the emulator replaces the target directory on export.
set -e
PROJECT="${FIREBASE_PROJECT_ID:-demo-contacts}"
DIR=/data/export
if [ -f "$DIR/firebase-export-metadata.json" ]; then
  exec firebase emulators:start --only auth --project "$PROJECT" --import="$DIR" --export-on-exit="$DIR"
fi
exec firebase emulators:start --only auth --project "$PROJECT" --export-on-exit="$DIR"
