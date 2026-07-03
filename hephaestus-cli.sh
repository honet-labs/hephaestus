#!/bin/bash
# Hephaestus DevOps Portal User Management CLI

# Check if dist/cli.js exists, if not build it
if [ ! -f "dist/cli.js" ]; then
  echo "Dist files not found. Building project..."
  npm run build
fi

node dist/cli.js "$@"
