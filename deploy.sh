#!/bin/sh
# Publish this folder to https://reyfrz.github.io
# (GitHub org "reyfrz", repo reyfrz/reyfrz.github.io, Pages serves branch main /).
# Stamps the CSS/JS links with a fresh version so browsers never mix old and new files.
set -e
cd "$(dirname "$0")"
V=$(date +%s)
sed -i '' -E "s#assets/css/site\.css(\?v=[0-9]+)?\"#assets/css/site.css?v=$V\"#; s#assets/js/main\.js(\?v=[0-9]+)?\"#assets/js/main.js?v=$V\"#" index.html
git add -A
git commit -q -m "${1:-Update site}" || true
git -c http.postBuffer=524288000 push -q origin main
echo "Pushed. Live in about a minute at https://reyfrz.github.io"
