#!/bin/bash

# ==============================================================================
# Terminal Eighty Routine Maintenance Script
# Runs via cron to clean up system resources and prevent disk exhaustion
# ==============================================================================

echo "Starting system maintenance at $(date)"

# 1. Prune unused Docker images, containers, and networks
# -a removes all unused images (not just dangling)
# -f forces without confirmation
echo "[1/3] Pruning Docker..."
docker system prune -af --volumes

# 2. Clean apt package manager cache
echo "[2/3] Cleaning apt cache..."
sudo apt-get autoremove -y
sudo apt-get clean

# 3. Trim system journal logs to last 7 days
echo "[3/3] Vacuuming journalctl logs..."
sudo journalctl --vacuum-time=7d

echo "Maintenance completed successfully at $(date)"
