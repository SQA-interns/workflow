#!/bin/sh
# Keeps emulator accounts in /data across restarts so signed-up Users survive `docker compose down`/`up`.
set -e
PROJECT="${FIREBASE_PROJECT_ID:-demo-contacts}"
if [ -f /data/firebase-export-metadata.json ]; then
  exec firebase emulators:start --only auth --project "$PROJECT" --import=/data --export-on-exit=/data
fi
exec firebase emulators:start --only auth --project "$PROJECT" --export-on-exit=/data
