#!/bin/bash
# Update Cloudflare API schemas submodule to latest version
# Backs up the previous version with a date stamp before updating

set -e

echo "Updating Cloudflare API schemas submodule..."

# Navigate to project root
cd "$(dirname "$0")/.."

# Get current commit hash before update
CURRENT_COMMIT=""
if [ -d "api-schemas-main/.git" ]; then
  CURRENT_COMMIT=$(git -C api-schemas-main rev-parse HEAD 2>/dev/null || echo "")
fi

# Create backups directory if it doesn't exist
mkdir -p api-schemas-backups

# If we have a current commit and it's different from what we're about to fetch, backup first
if [ -n "$CURRENT_COMMIT" ]; then
  # Fetch latest to check if there are updates
  cd api-schemas-main
  git fetch origin main 2>/dev/null || true
  REMOTE_COMMIT=$(git rev-parse origin/main 2>/dev/null || echo "")
  cd ..
  
  # If there's a new commit, backup the current version
  if [ -n "$NEW_COMMIT" ] && [ "$CURRENT_COMMIT" != "$NEW_COMMIT" ]; then
    BACKUP_DATE=$(date +"%Y-%m-%d_%H-%M-%S")
    BACKUP_DIR="api-schemas-backups/api-schemas-${BACKUP_DATE}"
    
    echo "Backing up current version (${CURRENT_COMMIT:0:8}) to ${BACKUP_DIR}..."
    
    # Copy current version to backup
    cp -r api-schemas-main "$BACKUP_DIR"
    
    # Remove .git directory from backup (we only want the files)
    rm -rf "$BACKUP_DIR/.git"
    
    # Create a metadata file with commit info
    cd api-schemas-main
    git log -1 --format="Commit: %H%nAuthor: %an <%ae>%nDate: %ad%nMessage: %s" > "../${BACKUP_DIR}/.backup-metadata.txt" 2>/dev/null || true
    cd ..
    
    echo "✅ Backup created: ${BACKUP_DIR}"
    echo ""
  fi
fi

# Update submodule to latest from remote
echo "Updating to latest version..."
git submodule update --remote api-schemas-main

# Show current commit
echo ""
echo "Current API schemas version:"
cd api-schemas-main
NEW_COMMIT=$(git rev-parse HEAD)
git log -1 --oneline
cd ..

# If we updated, show what changed
if [ -n "$CURRENT_COMMIT" ] && [ "$CURRENT_COMMIT" != "$NEW_COMMIT" ]; then
  echo ""
  echo "📊 Changes detected:"
  echo "  Previous: ${CURRENT_COMMIT:0:8}"
  echo "  Current:  ${NEW_COMMIT:0:8}"
fi

echo ""
echo "✅ API schemas updated successfully!"
echo ""
echo "To commit this update, run:"
echo "  git add api-schemas-main api-schemas-backups"
echo "  git commit -m 'chore: Update Cloudflare API schemas submodule'"

