#!/bin/sh
set -eu

case "${VBTECH_RELEASE_SHA:-}" in
  ""|*[!0-9a-f]*)
    echo "VBTECH_RELEASE_SHA must be a 40-character lowercase Git SHA" >&2
    exit 64
    ;;
esac

if [ "${#VBTECH_RELEASE_SHA}" -ne 40 ]; then
  echo "VBTECH_RELEASE_SHA must be a 40-character lowercase Git SHA" >&2
  exit 64
fi

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
