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

# 4. Promote any scheduled posts whose `publish_at` is past.
# Cron usually invokes scripts/promote-scheduled.sh directly every 5 min
# (see CONTRIBUTING.md), but we also fire here so a daily maintenance
# pass catches any drift if the 5-min cron was off.
SCHED_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/promote-scheduled.sh"
if [ -x "$SCHED_SCRIPT" ]; then
  echo "[4/4] Running scheduled-post promoter..."
  "$SCHED_SCRIPT" || echo "scheduler failed (continuing)"
fi

echo "Maintenance completed successfully at $(date)"
