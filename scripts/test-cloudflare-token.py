#!/usr/bin/env python3
"""
Test Cloudflare API Token
Tests the token with safe, read-only operations to verify permissions.
"""

import os
import sys
import json
import requests
from typing import Dict, List, Tuple
from datetime import datetime

# ANSI color codes
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
BOLD = '\033[1m'
RESET = '\033[0m'

class CloudflareTokenTester:
    def __init__(self, token: str, account_id: str, token_type: str = "account", verify_url: str = None):
        self.token = token
        self.account_id = account_id
        self.token_type = token_type
        self.verify_url = verify_url
        self.base_url = "https://api.cloudflare.com/client/v4"
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        self.results: List[Tuple[str, bool, str]] = []
    
    def print_header(self, text: str):
        """Print a formatted header"""
        print(f"\n{BLUE}{BOLD}{'='*60}{RESET}")
        print(f"{BLUE}{BOLD}{text}{RESET}")
        print(f"{BLUE}{BOLD}{'='*60}{RESET}\n")
    
    def print_test(self, name: str, success: bool, message: str):
        """Print test result"""
        if success is None:
            # Skipped test
            status = f"{YELLOW}⊘ SKIP{RESET}"
        else:
            status = f"{GREEN}✓ PASS{RESET}" if success else f"{RED}✗ FAIL{RESET}"
        print(f"{status} {name}")
        if message:
            print(f"     {message}")
        # Only count as pass/fail if not skipped
        if success is not None:
            self.results.append((name, success, message))
    
    def make_request(self, method: str, endpoint: str, description: str) -> Tuple[bool, str, Dict]:
        """Make a request to Cloudflare API"""
        url = f"{self.base_url}{endpoint}"
        
        try:
            response = requests.request(method, url, headers=self.headers, timeout=10)
            data = response.json()
            
            if response.status_code == 200 and data.get('success'):
                return True, f"{GREEN}Success{RESET}", data
            else:
                errors = data.get('errors', [])
                error_msg = errors[0].get('message', 'Unknown error') if errors else 'Unknown error'
                error_code = errors[0].get('code', 'N/A') if errors else 'N/A'
                return False, f"{RED}Error {error_code}: {error_msg}{RESET}", data
        
        except requests.exceptions.Timeout:
            return False, f"{RED}Request timeout{RESET}", {}
        except requests.exceptions.RequestException as e:
            return False, f"{RED}Request failed: {str(e)}{RESET}", {}
        except json.JSONDecodeError:
            return False, f"{RED}Invalid JSON response{RESET}", {}
    
    def test_token_verification(self):
        """Test 1: Verify the token itself"""
        self.print_header(f"Test 1: Token Verification ({self.token_type.upper()})")
        
        # Use custom verify URL if provided, otherwise use default
        if self.verify_url:
            # Extract the path from the full URL
            verify_path = self.verify_url.replace(self.base_url, "")
            success, message, data = self.make_request(
                "GET",
                verify_path,
                f"Verify {self.token_type} token is valid"
            )
        else:
            # Fallback to default user token verification
            success, message, data = self.make_request(
                "GET",
                "/user/tokens/verify",
                "Verify token is valid"
            )
        
        if success:
            result = data.get('result', {})
            token_id = result.get('id', 'N/A')
            status = result.get('status', 'N/A')
            expires_on = result.get('expires_on', 'Never')
            self.print_test(
                f"{self.token_type.capitalize()} Token Verification",
                True,
                f"Token ID: {token_id}, Status: {status}, Expires: {expires_on}"
            )
        else:
            self.print_test(f"{self.token_type.capitalize()} Token Verification", False, message)
        
        return success
    
    def test_account_access(self):
        """Test 2: List accounts"""
        self.print_header("Test 2: Account Access")
        
        success, message, data = self.make_request(
            "GET",
            "/accounts",
            "List accessible accounts"
        )
        
        if success:
            accounts = data.get('result', [])
            account_count = len(accounts)
            
            if account_count > 0:
                account_names = [acc.get('name', 'Unnamed') for acc in accounts[:3]]
                self.print_test(
                    "List Accounts",
                    True,
                    f"Found {account_count} account(s): {', '.join(account_names)}"
                )
            else:
                self.print_test("List Accounts", False, "No accounts accessible")
        else:
            self.print_test("List Accounts", False, message)
        
        return success
    
    def test_workers_list(self):
        """Test 3: List Workers scripts"""
        self.print_header("Test 3: Workers Scripts Access")
        
        success, message, data = self.make_request(
            "GET",
            f"/accounts/{self.account_id}/workers/scripts",
            "List Workers scripts"
        )
        
        if success:
            scripts = data.get('result', [])
            script_count = len(scripts)
            
            if script_count > 0:
                script_names = [s.get('id', 'Unnamed') for s in scripts[:5]]
                self.print_test(
                    "List Workers Scripts",
                    True,
                    f"Found {script_count} script(s): {', '.join(script_names)}"
                )
            else:
                self.print_test(
                    "List Workers Scripts",
                    True,
                    "No Workers scripts found (but access granted)"
                )
        else:
            self.print_test("List Workers Scripts", False, message)
        
        return success
    
    def test_d1_databases(self):
        """Test 4: List D1 databases"""
        self.print_header("Test 4: D1 Database Access")
        
        success, message, data = self.make_request(
            "GET",
            f"/accounts/{self.account_id}/d1/database",
            "List D1 databases"
        )
        
        if success:
            databases = data.get('result', [])
            db_count = len(databases)
            
            if db_count > 0:
                db_names = [db.get('name', 'Unnamed') for db in databases[:3]]
                self.print_test(
                    "List D1 Databases",
                    True,
                    f"Found {db_count} database(s): {', '.join(db_names)}"
                )
            else:
                self.print_test(
                    "List D1 Databases",
                    True,
                    "No D1 databases found (but access granted)"
                )
        else:
            self.print_test("List D1 Databases", False, message)
        
        return success
    
    def test_kv_namespaces(self):
        """Test 5: List KV namespaces"""
        self.print_header("Test 5: KV Storage Access")
        
        success, message, data = self.make_request(
            "GET",
            f"/accounts/{self.account_id}/storage/kv/namespaces",
            "List KV namespaces"
        )
        
        if success:
            namespaces = data.get('result', [])
            ns_count = len(namespaces)
            
            if ns_count > 0:
                ns_titles = [ns.get('title', 'Unnamed') for ns in namespaces[:3]]
                self.print_test(
                    "List KV Namespaces",
                    True,
                    f"Found {ns_count} namespace(s): {', '.join(ns_titles)}"
                )
            else:
                self.print_test(
                    "List KV Namespaces",
                    True,
                    "No KV namespaces found (but access granted)"
                )
        else:
            self.print_test("List KV Namespaces", False, message)
        
        return success
    
    def test_ai_models(self):
        """Test 6: List AI models"""
        self.print_header("Test 6: Workers AI Access")
        
        success, message, data = self.make_request(
            "GET",
            f"/accounts/{self.account_id}/ai/models/search",
            "List AI models"
        )
        
        if success:
            models = data.get('result', [])
            model_count = len(models)
            
            if model_count > 0:
                model_names = [m.get('name', 'Unnamed') for m in models[:3]]
                self.print_test(
                    "List AI Models",
                    True,
                    f"Found {model_count} model(s): {', '.join(model_names)}"
                )
            else:
                self.print_test(
                    "List AI Models",
                    True,
                    "No AI models found (but access granted)"
                )
        else:
            self.print_test("List AI Models", False, message)
        
        return success
    
    def test_api_tokens_list(self):
        """Test 7: List API tokens"""
        self.print_header("Test 7: API Tokens Read Access")
        
        # Use different endpoints based on token type
        # Account tokens: /accounts/{account_id}/tokens
        # User tokens: /user/tokens
        if self.token_type == 'account':
            endpoint = f"/accounts/{self.account_id}/tokens"
            description = "List account-owned API tokens"
        else:
            endpoint = "/user/tokens"
            description = "List user API tokens"
        
        success, message, data = self.make_request(
            "GET",
            endpoint,
            description
        )
        
        if success:
            tokens = data.get('result', [])
            token_count = len(tokens)
            
            if token_count > 0:
                token_names = [t.get('name', 'Unnamed') for t in tokens[:3]]
                self.print_test(
                    "List API Tokens",
                    True,
                    f"Found {token_count} token(s): {', '.join(token_names)}"
                )
            else:
                self.print_test(
                    "List API Tokens",
                    True,
                    "No tokens found (but access granted)"
                )
        else:
            self.print_test("List API Tokens", False, message)
        
        return success
    
    def print_summary(self):
        """Print test summary"""
        self.print_header("Test Summary")
        
        total = len(self.results)
        passed = sum(1 for _, success, _ in self.results if success)
        failed = total - passed
        
        print(f"Total Tests: {total}")
        print(f"{GREEN}Passed: {passed}{RESET}")
        print(f"{RED}Failed: {failed}{RESET}")
        print(f"Success Rate: {(passed/total*100):.1f}%\n")
        
        if failed > 0:
            print(f"{YELLOW}Failed Tests:{RESET}")
            for name, success, message in self.results:
                if not success:
                    print(f"  {RED}✗{RESET} {name}: {message}")
        
        print()
        
        return passed, failed
    
    def run_all_tests(self):
        """Run all tests"""
        print(f"\n{BOLD}Cloudflare API Token Tester - {self.token_type.upper()} TOKEN{RESET}")
        print(f"Testing token: {self.token[:20]}...{self.token[-10:]}")
        print(f"Token Type: {self.token_type}")
        if self.verify_url:
            print(f"Verify URL: {self.verify_url}")
        print(f"Account ID: {self.account_id}")
        print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        # Run tests
        self.test_token_verification()
        self.test_account_access()
        self.test_workers_list()
        self.test_d1_databases()
        self.test_kv_namespaces()
        self.test_ai_models()
        self.test_api_tokens_list()
        
        # Print summary
        passed, failed = self.print_summary()
        
        return passed, failed


def load_env_vars():
    """Load environment variables from .dev.vars"""
    env_file = os.path.join(os.path.dirname(__file__), '..', '.dev.vars')
    
    if not os.path.exists(env_file):
        print(f"{RED}Error: .dev.vars file not found at {env_file}{RESET}")
        sys.exit(1)
    
    env_vars = {}
    with open(env_file, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                # Remove quotes
                value = value.strip('"').strip("'")
                env_vars[key] = value
    
    return env_vars


def trigger_self_heal(worker_url: str, auth_token: str) -> bool:
    """Trigger self-heal via worker API"""
    print(f"\n{BOLD}{'='*70}{RESET}")
    print(f"{BOLD}TRIGGERING SELF-HEAL{RESET}")
    print(f"{BOLD}{'='*70}{RESET}\n")
    
    heal_url = f"{worker_url}/tokens/heal"
    
    try:
        print(f"Calling {heal_url}...")
        response = requests.post(
            heal_url,
            headers={
                'Authorization': f'Bearer {auth_token}',
                'Content-Type': 'application/json'
            },
            timeout=30
        )
        
        data = response.json()
        
        if response.status_code == 200 and data.get('success'):
            print(f"{GREEN}✓ Self-heal triggered successfully{RESET}\n")
            
            # Display heal results
            if data.get('data', {}).get('auto_heal_results'):
                results = data['data']['auto_heal_results']
                
                if 'account_token' in results:
                    acc_result = results['account_token']
                    if acc_result.get('success'):
                        perms_added = len(acc_result.get('permissions_added', []))
                        print(f"{GREEN}✓ Account Token:{RESET} {acc_result.get('message', 'Healed')}")
                        if perms_added > 0:
                            print(f"  Added {perms_added} permissions:")
                            for perm in acc_result.get('permissions_added', [])[:5]:
                                print(f"    • {perm}")
                            if perms_added > 5:
                                print(f"    • ... and {perms_added - 5} more")
                    else:
                        print(f"{RED}✗ Account Token:{RESET} {acc_result.get('message', 'Failed')}")
                        if acc_result.get('error'):
                            print(f"  Error: {acc_result['error']}")
                
                if 'user_token' in results:
                    user_result = results['user_token']
                    if user_result.get('success'):
                        perms_added = len(user_result.get('permissions_added', []))
                        print(f"{GREEN}✓ User Token:{RESET} {user_result.get('message', 'Healed')}")
                        if perms_added > 0:
                            print(f"  Added {perms_added} permissions:")
                            for perm in user_result.get('permissions_added', []):
                                print(f"    • {perm}")
                    else:
                        print(f"{RED}✗ User Token:{RESET} {user_result.get('message', 'Failed')}")
                        if user_result.get('error'):
                            print(f"  Error: {user_result['error']}")
            
            print()
            return True
        else:
            error_msg = data.get('message', 'Unknown error')
            print(f"{RED}✗ Self-heal failed: {error_msg}{RESET}\n")
            return False
    
    except requests.exceptions.Timeout:
        print(f"{RED}✗ Self-heal request timed out{RESET}\n")
        return False
    except Exception as e:
        print(f"{RED}✗ Self-heal failed: {str(e)}{RESET}\n")
        return False


def main():
    """Main entry point"""
    # Load environment variables
    env_vars = load_env_vars()
    
    account_id = env_vars.get('CLOUDFLARE_ACCOUNT_ID')
    worker_url = env_vars.get('WORKER_URL') or env_vars.get('BASE_URL')
    client_auth_token = env_vars.get('CLIENT_AUTH_TOKEN')
    
    if not account_id:
        print(f"{RED}Error: CLOUDFLARE_ACCOUNT_ID not found in .dev.vars{RESET}")
        sys.exit(1)
    
    # Get tokens and their verify URLs
    account_token = env_vars.get('CLOUDFLARE_ACCOUNT_TOKEN')
    account_verify_url = env_vars.get('CLOUDFLARE_ACCOUNT_TOKEN_VERIFY_URL')
    
    user_token = env_vars.get('CLOUDFLARE_USER_TOKEN')
    user_verify_url = env_vars.get('CLOUDFLARE_USER_TOKEN_VERIFY_URL')
    
    # Check if at least one token is available
    if not account_token and not user_token:
        print(f"{RED}Error: Neither CLOUDFLARE_ACCOUNT_TOKEN nor CLOUDFLARE_USER_TOKEN found in .dev.vars{RESET}")
        sys.exit(1)
    
    # Track if we need to re-test after healing
    needs_healing = False
    initial_total_passed = 0
    initial_total_failed = 0
    
    # Test Account Token
    if account_token:
        print(f"\n{BOLD}{'='*70}{RESET}")
        print(f"{BOLD}INITIAL TEST - ACCOUNT TOKEN{RESET}")
        print(f"{BOLD}{'='*70}{RESET}")
        
        tester = CloudflareTokenTester(
            token=account_token,
            account_id=account_id,
            token_type="account",
            verify_url=account_verify_url
        )
        passed, failed = tester.run_all_tests()
        initial_total_passed += passed
        initial_total_failed += failed
        
        # Check if healing is needed (failed tests that might be permission-related)
        if failed > 0:
            needs_healing = True
    else:
        print(f"\n{YELLOW}⚠ CLOUDFLARE_ACCOUNT_TOKEN not found, skipping account token tests{RESET}")
    
    # Test User Token
    if user_token:
        print(f"\n\n{BOLD}{'='*70}{RESET}")
        print(f"{BOLD}INITIAL TEST - USER TOKEN{RESET}")
        print(f"{BOLD}{'='*70}{RESET}")
        
        tester = CloudflareTokenTester(
            token=user_token,
            account_id=account_id,
            token_type="user",
            verify_url=user_verify_url
        )
        passed, failed = tester.run_all_tests()
        initial_total_passed += passed
        initial_total_failed += failed
        
        # Check if healing is needed
        if failed > 0:
            needs_healing = True
    else:
        print(f"\n{YELLOW}⚠ CLOUDFLARE_USER_TOKEN not found, skipping user token tests{RESET}")
    
    # Print initial summary
    print(f"\n\n{BOLD}{'='*70}{RESET}")
    print(f"{BOLD}INITIAL TEST SUMMARY{RESET}")
    print(f"{BOLD}{'='*70}{RESET}\n")
    
    tokens_tested = []
    if account_token:
        tokens_tested.append("Account Token")
    if user_token:
        tokens_tested.append("User Token")
    
    print(f"Tokens Tested: {', '.join(tokens_tested)}")
    print(f"{GREEN}Total Passed: {initial_total_passed}{RESET}")
    print(f"{RED}Total Failed: {initial_total_failed}{RESET}")
    print(f"Initial Success Rate: {(initial_total_passed/(initial_total_passed+initial_total_failed)*100):.1f}%\n")
    
    # Trigger self-heal if needed
    if needs_healing and initial_total_failed > 0:
        if not worker_url:
            print(f"{YELLOW}⚠ WORKER_URL not found in .dev.vars, cannot trigger self-heal{RESET}")
            print(f"{YELLOW}  Add WORKER_URL to .dev.vars to enable automatic healing{RESET}\n")
            sys.exit(1 if initial_total_failed > 0 else 0)
        
        if not client_auth_token:
            print(f"{YELLOW}⚠ CLIENT_AUTH_TOKEN not found in .dev.vars, cannot trigger self-heal{RESET}")
            print(f"{YELLOW}  Add CLIENT_AUTH_TOKEN to .dev.vars to enable automatic healing{RESET}\n")
            sys.exit(1 if initial_total_failed > 0 else 0)
        
        print(f"\n{YELLOW}⚠ Detected {initial_total_failed} failed tests. Attempting self-heal...{RESET}")
        
        heal_success = trigger_self_heal(worker_url, client_auth_token)
        
        if heal_success:
            print(f"{BLUE}Waiting 3 seconds for changes to propagate...{RESET}")
            import time
            time.sleep(3)
            
            # Re-test tokens
            retest_total_passed = 0
            retest_total_failed = 0
            
            # Re-test Account Token
            if account_token:
                print(f"\n{BOLD}{'='*70}{RESET}")
                print(f"{BOLD}RE-TEST AFTER HEALING - ACCOUNT TOKEN{RESET}")
                print(f"{BOLD}{'='*70}{RESET}")
                
                tester = CloudflareTokenTester(
                    token=account_token,
                    account_id=account_id,
                    token_type="account",
                    verify_url=account_verify_url
                )
                passed, failed = tester.run_all_tests()
                retest_total_passed += passed
                retest_total_failed += failed
            
            # Re-test User Token
            if user_token:
                print(f"\n\n{BOLD}{'='*70}{RESET}")
                print(f"{BOLD}RE-TEST AFTER HEALING - USER TOKEN{RESET}")
                print(f"{BOLD}{'='*70}{RESET}")
                
                tester = CloudflareTokenTester(
                    token=user_token,
                    account_id=account_id,
                    token_type="user",
                    verify_url=user_verify_url
                )
                passed, failed = tester.run_all_tests()
                retest_total_passed += passed
                retest_total_failed += failed
            
            # Print final comparison
            print(f"\n\n{BOLD}{'='*70}{RESET}")
            print(f"{BOLD}FINAL SUMMARY - BEFORE AND AFTER HEALING{RESET}")
            print(f"{BOLD}{'='*70}{RESET}\n")
            
            print(f"Tokens Tested: {', '.join(tokens_tested)}\n")
            
            print(f"{BOLD}Before Healing:{RESET}")
            print(f"  {GREEN}Passed: {initial_total_passed}{RESET}")
            print(f"  {RED}Failed: {initial_total_failed}{RESET}")
            print(f"  Success Rate: {(initial_total_passed/(initial_total_passed+initial_total_failed)*100):.1f}%\n")
            
            print(f"{BOLD}After Healing:{RESET}")
            print(f"  {GREEN}Passed: {retest_total_passed}{RESET}")
            print(f"  {RED}Failed: {retest_total_failed}{RESET}")
            print(f"  Success Rate: {(retest_total_passed/(retest_total_passed+retest_total_failed)*100):.1f}%\n")
            
            improvement = retest_total_passed - initial_total_passed
            if improvement > 0:
                print(f"{GREEN}✓ Improvement: +{improvement} tests now passing{RESET}")
            elif improvement == 0 and retest_total_failed > 0:
                print(f"{YELLOW}⚠ No improvement after healing. Manual intervention may be required.{RESET}")
            else:
                print(f"{GREEN}✓ All tests passing!{RESET}")
            
            print()
            
            # Exit with appropriate code based on final results
            sys.exit(0 if retest_total_failed == 0 else 1)
        else:
            print(f"{RED}✗ Self-heal failed. Exiting with initial test results.{RESET}\n")
            sys.exit(1)
    else:
        print(f"{GREEN}✓ All tests passed! No healing needed.{RESET}\n")
        sys.exit(0)


if __name__ == '__main__':
    main()

