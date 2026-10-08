#!/usr/bin/env bash
# Usage: scripts/live-check.sh deployed     (needs BASE_URL)
#        scripts/live-check.sh real-sites   (audits public sites with the local engine)
set -uo pipefail

summarise() {
  jq -r '"score \(.score.overall) | " + ([.score.categories | to_entries[] | "\(.key) \(.value.score // .value)"] | join(", ")),
         "pages \(.stats.pagesCrawled), links \(.stats.linksChecked), broken \(.stats.brokenLinks), ttfb \(.stats.ttfbMs)ms, partial \(.partial)",
         (.issues[] | "  [\(.severity)] \(.id) x\(.count // 1) \(.affected[:2] | map(if type == "object" then (.url // tostring) else tostring end) | join(" "))")'
}

if [ "${1:-}" = deployed ]; then
  : "${BASE_URL:?}"
  # Free Render instances sleep: the first request can take ~1 minute.
  for path in /api/health / /fr/ /tools/ /robots.txt /sitemap.xml /api/config; do
    code=$(curl -sS -o /dev/null -m 120 -w '%{http_code} %{time_total}s' "$BASE_URL$path")
    echo "$path -> $code"
  done
  echo "--- health"; curl -sS -m 30 "$BASE_URL/api/health"; echo
  echo "--- robots.txt"; curl -sS -m 30 "$BASE_URL/robots.txt"
  echo "--- security headers on /"; curl -sS -m 30 -D - -o /dev/null "$BASE_URL/" | grep -iE '^(content-security|strict-transport|x-content|x-frame|referrer)'
  echo "--- Google tags on /"; curl -sS -m 30 "$BASE_URL/" | grep -oE '<meta name="google-site-verification"[^>]*>|<script async src="https://pagead2[^"]*"' || echo "(none)"
  echo "--- ads.txt"; curl -sS -m 30 "$BASE_URL/ads.txt"; echo
  echo "--- audit through the API"
  res=$(curl -sS -m 30 -H 'content-type: application/json' -d '{"url":"https://example.com"}' "$BASE_URL/api/audits")
  echo "$res"
  id=$(echo "$res" | jq -r '.id // empty')
  [ -n "$id" ] || exit 1
  for _ in $(seq 1 60); do
    st=$(curl -sS -m 30 "$BASE_URL/api/audits/$id")
    case "$(echo "$st" | jq -r .status)" in done|failed) break ;; esac
    sleep 3
  done
  echo "$st"
  curl -sS -o /dev/null -w "report page /r/$id -> %{http_code}\n" "$BASE_URL/r/$id"
  curl -sS -m 30 "$BASE_URL/api/reports/$id?lang=fr" | jq -c '{score: .score.overall, issues: (.issues | length), fixesCount, deep}'
  exit 0
fi

sites=(
  https://example.com
  https://www.wikipedia.org
  https://developer.mozilla.org/fr/
  https://www.service-public.fr
  https://www.lemonde.fr
  https://www.python.org
  https://www.boulanger.com
  https://fr.wordpress.org
)
mkdir -p live-reports
for url in "${sites[@]}"; do
  echo "=================== $url"
  name=$(echo "$url" | sed -E 's#https?://##; s#[^a-zA-Z0-9]+#_#g')
  if node scripts/audit-cli.js "$url" --json > "live-reports/$name.json" 2> "live-reports/$name.err"; then
    summarise < "live-reports/$name.json"
  else
    tail -n 2 "live-reports/$name.err"
  fi
done
