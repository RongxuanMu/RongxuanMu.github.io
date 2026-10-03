#!/bin/sh
# Deploy the built site (index.html, sw.js, assets/) to the Vercel project "microduck-xr".
# Run build.py first. Sources, build scripts and the CodePen copy stay out of the upload.
set -e
cd "$(dirname "$0")"
out=$(mktemp -d)/microduck-xr
mkdir -p "$out"
cp -R index.html sw.js assets "$out"/
cat > "$out/vercel.json" <<'EOF'
{
  "headers": [
    { "source": "/assets/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
    { "source": "/sw.js", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] }
  ]
}
EOF
cd "$out" && vercel deploy --prod --yes --name microduck-xr
