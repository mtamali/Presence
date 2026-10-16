#!/usr/bin/env bash
# Launch the Présence web app (Vite dev server).
# Usage: ./start.sh

set -euo pipefail
cd "$(dirname "$0")"

# Install Node dependencies if needed
if [ ! -d node_modules ]; then
  echo "📦 Installing dependencies …"
  npm install
fi

echo "🚀 Starting Présence …"
npm run dev
