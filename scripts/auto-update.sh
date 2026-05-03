#!/bin/bash

# ==============================================================================
# Terminal Eighty Auto-Update Script
# Runs via cron to pull latest GitHub changes and restart Docker containers
# ==============================================================================

# Variables (Adjust if cloned to a different path on the Pi)
REPO_DIR="/home/adam/terminal-eighty-blog"

# Navigate to repo
cd "$REPO_DIR" || { echo "Failed to find repo at $REPO_DIR"; exit 1; }

# Fetch latest from remote
git fetch origin main

# Check if local matches remote
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse @{u})

if [ "$LOCAL" != "$REMOTE" ]; then
    echo "$(date): Updates found. Pulling latest code..."
    
    # Pull changes
    git pull origin main
    
    # Rebuild containers
    echo "$(date): Restarting Docker containers..."
    docker compose down
    docker compose up -d --build
    
    echo "$(date): Update and deployment complete."
else
    echo "$(date): System is up to date."
fi
