#!/usr/bin/env python3
"""
Extract PR Comments Script

This script uses GitHub CLI (gh) to extract all code comments from the current open PR
in the repository. It automatically finds the open PR and extracts comments with file
paths and line numbers.

Requirements:
- GitHub CLI (gh) installed and authenticated
- Python 3.x

Usage:
    python scripts/extract-pr-comments.py
    # or
    ./scripts/extract-pr-comments.py

Output:
    pr_comments.txt - Contains all PR comments with format: "file:line - comment"
"""

import subprocess
import json
import sys
import os
from pathlib import Path

def run_gh_command(command, capture_output=True):
    """Run a GitHub CLI command and return the result."""
    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=capture_output,
            text=True,
            check=True
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        print(f"Error running command: {command}")
        print(f"Error output: {e.stderr}")
        return None

def get_open_pr():
    """Find the current open PR for this repository."""
    print("🔍 Finding open PR...")

    # Get the current repository name from git
    try:
        remote_url = run_gh_command("git config --get remote.origin.url")
        if not remote_url:
            print("❌ Could not get git remote URL")
            return None

        # Extract repo name from URL (supports both HTTPS and SSH formats)
        if "github.com" in remote_url:
            if remote_url.startswith("https://"):
                # https://github.com/owner/repo.git
                repo_part = remote_url.split("github.com/")[1]
            else:
                # git@github.com:owner/repo.git
                repo_part = remote_url.split("github.com:")[1]

            # Remove .git extension more safely
            if repo_part.endswith(".git"):
                repo_part = repo_part[:-4]  # Remove last 4 characters (.git)

            owner, repo = repo_part.split("/")
        else:
            print("❌ Not a GitHub repository")
            return None

    except Exception as e:
        print(f"❌ Error getting repository info: {e}")
        return None

    # Find open PRs for this repo
    try:
        prs_output = run_gh_command(f"gh pr list --repo {owner}/{repo} --json number,title,headRefName")
        if not prs_output:
            print("❌ No open PRs found")
            return None

        prs = json.loads(prs_output)
        if not prs:
            print("❌ No open PRs found")
            return None

        # For now, just take the first open PR
        # In the future, could add logic to match current branch
        pr = prs[0]
        print(f"✅ Found open PR #{pr['number']}: {pr['title']}")

        return {
            'number': pr['number'],
            'title': pr['title'],
            'repo': f"{owner}/{repo}"
        }

    except Exception as e:
        print(f"❌ Error finding PR: {e}")
        return None

def extract_pr_comments(pr_info):
    """Extract all comments from the PR."""
    print(f"📝 Extracting comments from PR #{pr_info['number']}...")

    try:
        # Use gh api to get PR comments with pagination
        cmd = f"gh api repos/{pr_info['repo']}/pulls/{pr_info['number']}/comments --paginate --jq '.[] | \"\\(.path):\\(.line) - \\(.body)\"'"

        comments_output = run_gh_command(cmd)
        if comments_output is None:
            print("❌ Failed to extract comments")
            return None

        comments = comments_output.strip().split('\n') if comments_output.strip() else []

        print(f"✅ Found {len(comments)} comments")

        return comments

    except Exception as e:
        print(f"❌ Error extracting comments: {e}")
        return None

def save_comments_to_file(comments, pr_info):
    """Save comments to a file."""
    filename = f"pr_{pr_info['number']}_comments.txt"

    try:
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(f"PR #{pr_info['number']}: {pr_info['title']}\n")
            f.write(f"Repository: {pr_info['repo']}\n")
            f.write("=" * 50 + "\n\n")

            if comments:
                for comment in comments:
                    f.write(f"{comment}\n\n")
            else:
                f.write("No comments found.\n")

        print(f"💾 Comments saved to: {filename}")
        return filename

    except Exception as e:
        print(f"❌ Error saving comments: {e}")
        return None

def main():
    """Main function."""
    print("🚀 PR Comments Extractor")
    print("=" * 30)

    # Check if gh CLI is available
    if not run_gh_command("gh --version"):
        print("❌ GitHub CLI (gh) is not installed or not authenticated")
        print("Please install gh CLI and run 'gh auth login'")
        sys.exit(1)

    # Get open PR
    pr_info = get_open_pr()
    if not pr_info:
        print("❌ Could not find an open PR")
        sys.exit(1)

    # Extract comments
    comments = extract_pr_comments(pr_info)
    if comments is None:
        print("❌ Failed to extract comments")
        sys.exit(1)

    # Save to file
    filename = save_comments_to_file(comments, pr_info)
    if filename:
        print(f"🎉 Success! Comments extracted to {filename}")

        # Show summary
        print(f"\n📊 Summary:")
        print(f"   PR: #{pr_info['number']} - {pr_info['title']}")
        print(f"   Repository: {pr_info['repo']}")
        print(f"   Comments: {len(comments)}")
        print(f"   Output file: {filename}")
    else:
        print("❌ Failed to save comments")
        sys.exit(1)

if __name__ == "__main__":
    main()
