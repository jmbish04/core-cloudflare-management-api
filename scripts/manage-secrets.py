#!/usr/bin/env python3
"""
Manage Cloudflare Worker Secrets
Sync secrets from .dev.vars to all Wrangler environments.
"""

import os
import sys
import subprocess
import argparse
from typing import Dict, List, Tuple
from pathlib import Path

# ANSI color codes
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
BOLD = '\033[1m'
RESET = '\033[0m'


class SecretsManager:
    def __init__(self, project_root: Path):
        self.project_root = project_root
        self.dev_vars_file = project_root / '.dev.vars'
        self.secrets: Dict[str, str] = {}
    
    def print_header(self, text: str):
        """Print a formatted header"""
        print(f"\n{BLUE}{BOLD}{'='*70}{RESET}")
        print(f"{BLUE}{BOLD}{text}{RESET}")
        print(f"{BLUE}{BOLD}{'='*70}{RESET}\n")
    
    def print_success(self, text: str):
        """Print success message"""
        print(f"{GREEN}✓{RESET} {text}")
    
    def print_error(self, text: str):
        """Print error message"""
        print(f"{RED}✗{RESET} {text}")
    
    def print_warning(self, text: str):
        """Print warning message"""
        print(f"{YELLOW}⚠{RESET} {text}")
    
    def print_info(self, text: str):
        """Print info message"""
        print(f"{BLUE}ℹ{RESET} {text}")
    
    def load_secrets(self) -> bool:
        """Load secrets from .dev.vars file"""
        if not self.dev_vars_file.exists():
            self.print_error(f".dev.vars file not found at {self.dev_vars_file}")
            return False
        
        self.print_info(f"Loading secrets from {self.dev_vars_file}")
        
        with open(self.dev_vars_file, 'r') as f:
            for line in f:
                line = line.strip()
                
                # Skip empty lines and comments
                if not line or line.startswith('#'):
                    continue
                
                # Parse key=value
                if '=' in line:
                    key, value = line.split('=', 1)
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    
                    if key and value:
                        self.secrets[key] = value
        
        if not self.secrets:
            self.print_error("No secrets found in .dev.vars")
            return False
        
        self.print_success(f"Loaded {len(self.secrets)} secrets")
        return True
    
    def list_secrets(self):
        """List all secrets"""
        self.print_header("Available Secrets")
        
        for key in sorted(self.secrets.keys()):
            value = self.secrets[key]
            # Mask the value for security
            if len(value) > 20:
                masked = f"{value[:10]}...{value[-10:]}"
            else:
                masked = "*" * len(value)
            
            print(f"  {BLUE}{key}{RESET} = {masked}")
        
        print()
    
    def upload_secret(self, key: str, value: str, environment: str = None) -> bool:
        """Upload a single secret to Wrangler"""
        env_flag = f"--env={environment}" if environment and environment != "default" else ""
        env_display = environment if environment and environment != "default" else "default (dev)"
        
        try:
            # Build command
            cmd = ["npx", "wrangler", "secret", "put", key]
            if env_flag:
                cmd.append(env_flag)
            
            # Run command with value piped to stdin
            result = subprocess.run(
                cmd,
                input=value.encode(),
                cwd=self.project_root,
                capture_output=True,
                timeout=30
            )
            
            # Check if successful
            if result.returncode == 0 and b"Success" in result.stdout:
                return True
            else:
                error_msg = result.stderr.decode() if result.stderr else "Unknown error"
                self.print_error(f"Failed to upload {key} to {env_display}: {error_msg}")
                return False
        
        except subprocess.TimeoutExpired:
            self.print_error(f"Timeout uploading {key} to {env_display}")
            return False
        except Exception as e:
            self.print_error(f"Error uploading {key} to {env_display}: {str(e)}")
            return False
    
    def sync_to_environment(self, environment: str, keys: List[str] = None) -> Tuple[int, int]:
        """Sync secrets to a specific environment"""
        env_display = environment if environment != "default" else "default (dev)"
        
        self.print_header(f"Syncing to: {env_display}")
        
        # Determine which keys to sync
        keys_to_sync = keys if keys else list(self.secrets.keys())
        
        success_count = 0
        fail_count = 0
        
        for key in keys_to_sync:
            if key not in self.secrets:
                self.print_warning(f"Secret '{key}' not found in .dev.vars, skipping")
                continue
            
            value = self.secrets[key]
            print(f"  Uploading {BLUE}{key}{RESET}...", end=" ", flush=True)
            
            if self.upload_secret(key, value, environment):
                print(f"{GREEN}✓{RESET}")
                success_count += 1
            else:
                print(f"{RED}✗{RESET}")
                fail_count += 1
        
        print()
        print(f"  {GREEN}Success: {success_count}{RESET} | {RED}Failed: {fail_count}{RESET}")
        print()
        
        return success_count, fail_count
    
    def sync_all_environments(self, environments: List[str], keys: List[str] = None):
        """Sync secrets to all specified environments"""
        total_success = 0
        total_fail = 0
        
        for env in environments:
            success, fail = self.sync_to_environment(env, keys)
            total_success += success
            total_fail += fail
        
        # Print final summary
        self.print_header("Final Summary")
        print(f"Environments: {len(environments)}")
        print(f"Secrets per environment: {len(keys) if keys else len(self.secrets)}")
        print(f"{GREEN}Total Success: {total_success}{RESET}")
        print(f"{RED}Total Failed: {total_fail}{RESET}")
        print()
        
        return total_fail == 0


def main():
    parser = argparse.ArgumentParser(
        description="Manage Cloudflare Worker secrets across environments",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # List all secrets
  %(prog)s --list

  # Sync all secrets to production
  %(prog)s --env production

  # Sync all secrets to all environments
  %(prog)s --env default production staging

  # Sync specific secrets to production
  %(prog)s --env production --keys CLOUDFLARE_ACCOUNT_TOKEN CLOUDFLARE_USER_TOKEN

  # Sync all secrets to all environments
  %(prog)s --all
        """
    )
    
    parser.add_argument(
        '--list', '-l',
        action='store_true',
        help='List all secrets from .dev.vars'
    )
    
    parser.add_argument(
        '--env', '-e',
        nargs='+',
        metavar='ENV',
        help='Environment(s) to sync to (e.g., default, production, staging)'
    )
    
    parser.add_argument(
        '--all', '-a',
        action='store_true',
        help='Sync to all environments (default, production)'
    )
    
    parser.add_argument(
        '--keys', '-k',
        nargs='+',
        metavar='KEY',
        help='Specific secret keys to sync (default: all)'
    )
    
    args = parser.parse_args()
    
    # Find project root
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    
    # Initialize manager
    manager = SecretsManager(project_root)
    
    # Load secrets
    if not manager.load_secrets():
        sys.exit(1)
    
    # Handle --list
    if args.list:
        manager.list_secrets()
        sys.exit(0)
    
    # Determine environments
    environments = []
    if args.all:
        environments = ['default', 'production']
    elif args.env:
        environments = args.env
    else:
        print(f"{RED}Error: Please specify --env, --all, or --list{RESET}")
        parser.print_help()
        sys.exit(1)
    
    # Sync secrets
    print(f"\n{BOLD}Cloudflare Worker Secrets Manager{RESET}")
    print(f"Project: {project_root.name}")
    print(f"Environments: {', '.join(environments)}")
    if args.keys:
        print(f"Keys: {', '.join(args.keys)}")
    else:
        print(f"Keys: All ({len(manager.secrets)} secrets)")
    
    success = manager.sync_all_environments(environments, args.keys)
    
    if success:
        print(f"{GREEN}{BOLD}✓ All secrets synced successfully!{RESET}")
        sys.exit(0)
    else:
        print(f"{RED}{BOLD}✗ Some secrets failed to sync{RESET}")
        sys.exit(1)


if __name__ == '__main__':
    main()

