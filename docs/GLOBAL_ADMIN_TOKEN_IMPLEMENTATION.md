# Global Admin Token Implementation

**Date**: November 14, 2025  
**Status**: ✅ Implemented and Deployed

---

## 🎯 **What Was Done**

Implemented support for a **Global Admin Token** to enable true cross-token self-healing.

---

## 📝 **Changes Made**

### **1. Environment Variables**

**File**: `.dev.vars`

Added new environment variable:
```bash
CLOUDFLARE_GLOBAL_ADMIN_TOKEN="YOUR_GLOBAL_ADMIN_TOKEN_HERE"
CLOUDFLARE_GLOBAL_ADMIN_TOKEN_VERIFY_URL="https://api.cloudflare.com/client/v4/user/tokens/verify"
```

**Purpose**: Store your personal Cloudflare API token with full permissions for self-healing other tokens.

---

### **2. TypeScript Types**

**File**: `src/types.ts`

Updated `Env` interface:
```typescript
export interface Env {
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_ACCOUNT_TOKEN: string;
  CLOUDFLARE_USER_TOKEN: string;
  CLOUDFLARE_GLOBAL_ADMIN_TOKEN?: string; // ← NEW: Optional global admin token
  // ... other fields
}
```

---

### **3. Token Manager Service**

**File**: `src/services/token-manager.ts`

Updated healing logic to prefer global admin token:

```typescript
// Before: Always used USER token
const authToken = this.env.CLOUDFLARE_USER_TOKEN;

// After: Prefer GLOBAL_ADMIN_TOKEN, fallback to USER token
const authToken = this.env.CLOUDFLARE_GLOBAL_ADMIN_TOKEN || this.env.CLOUDFLARE_USER_TOKEN;
const tokenSource = this.env.CLOUDFLARE_GLOBAL_ADMIN_TOKEN ? 'GLOBAL ADMIN' : 'USER';
```

**Benefits**:
- ✅ If global admin token is set → Can heal ALL tokens
- ✅ If not set → Falls back to user token (limited visibility)
- ✅ No breaking changes for existing deployments

---

### **4. Documentation**

Created comprehensive setup guide:
- **`docs/GLOBAL_ADMIN_TOKEN_SETUP.md`**: Step-by-step setup instructions
- **`docs/GLOBAL_ADMIN_TOKEN_IMPLEMENTATION.md`**: This file (technical details)

---

## 🔄 **How It Works**

### **Token Healing Flow**

```
┌─────────────────────────────────────────────────┐
│  1. Token Health Check (every 6 hours)         │
│     - Check account token permissions          │
│     - Check user token permissions             │
│     - Identify missing permissions             │
└─────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│  2. Select Healing Token                       │
│     - If GLOBAL_ADMIN_TOKEN exists → Use it    │
│     - Else → Use USER_TOKEN (fallback)         │
└─────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│  3. Fetch Token Details                        │
│     - GET /user/tokens/{token_id}              │
│     - Get current policies                     │
└─────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│  4. Fetch Permission Group IDs                 │
│     - GET /user/tokens/permission_groups       │
│     - Map resource names to 32-char IDs        │
└─────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│  5. Update Token Permissions                   │
│     - PUT /user/tokens/{token_id}              │
│     - Add missing permissions                  │
│     - Log results to D1                        │
└─────────────────────────────────────────────────┘
```

---

## ✅ **Advantages of Global Admin Token**

| Feature | Without Global Admin | With Global Admin |
|---------|---------------------|-------------------|
| **Heal Account Token** | ❌ Cannot see it | ✅ Can see and edit |
| **Heal User Token** | ⚠️ Can edit itself only | ✅ Can edit from outside |
| **Permission Visibility** | Limited to created tokens | All tokens in account |
| **True Self-Healing** | ❌ No | ✅ Yes |
| **Manual Intervention** | Required for account token | Not required |

---

## 🔧 **Setup Instructions**

### **Quick Setup**

1. **Add your global token to `.dev.vars`**:
   ```bash
   # Edit .dev.vars
   CLOUDFLARE_GLOBAL_ADMIN_TOKEN="your_actual_global_token_here"
   ```

2. **Sync to production**:
   ```bash
   ./scripts/sync-secrets.sh production
   ```

3. **Test healing**:
   ```bash
   python3 scripts/test-cloudflare-token.py
   ```

### **Detailed Setup**

See **[GLOBAL_ADMIN_TOKEN_SETUP.md](GLOBAL_ADMIN_TOKEN_SETUP.md)** for:
- How to get your global token
- Security best practices
- Verification steps
- Monitoring setup

---

## 🔒 **Security**

### **Token Isolation**

- **Global Admin Token**: Used **ONLY** for self-healing (token management)
- **Account Token**: Used for all worker operations (D1, KV, AI, etc.)
- **User Token**: Used for user-level operations (listing tokens, user info)

### **Fallback Behavior**

If `CLOUDFLARE_GLOBAL_ADMIN_TOKEN` is not set:
- ✅ Worker continues to function normally
- ✅ Falls back to `CLOUDFLARE_USER_TOKEN` for healing
- ⚠️ Limited to tokens the user token can see
- ✅ No breaking changes

### **Best Practices**

1. ✅ Store in `.dev.vars` (gitignored)
2. ✅ Use Wrangler secrets for production
3. ✅ Rotate every 90 days
4. ✅ Monitor usage via logs
5. ❌ Never commit to git
6. ❌ Never share publicly

---

## 📊 **Testing**

### **Verify Global Token is Used**

```bash
# Trigger manual heal
curl -X POST \
  -H "Authorization: Bearer 4156582389" \
  https://core-cloudflare-management-api.hacolby.workers.dev/tokens/heal | jq

# Check logs
wrangler tail --env=production | grep "GLOBAL ADMIN"

# Expected output:
# "🔄 Cross-token healing: Using GLOBAL ADMIN token to modify ACCOUNT token"
# "✅ Successfully updated ACCOUNT token with X new permissions"
```

### **Verify Fallback Works**

```bash
# Remove global token temporarily
wrangler secret delete CLOUDFLARE_GLOBAL_ADMIN_TOKEN --env=production

# Trigger heal again
curl -X POST \
  -H "Authorization: Bearer 4156582389" \
  https://core-cloudflare-management-api.hacolby.workers.dev/tokens/heal | jq

# Check logs
wrangler tail --env=production | grep "USER token"

# Expected output:
# "🔄 Cross-token healing: Using USER token to modify ACCOUNT token"
```

---

## 📈 **Impact**

### **Before Global Admin Token**

```
Account Token: 6/7 tests pass (85.7%)
User Token:    2/7 tests pass (28.6%)
Overall:       8/14 tests pass (57.1%)

Self-Heal Results:
├── Account Token: ❌ Failed (token not visible to user token)
└── User Token:    ⚠️  Can fetch itself, but permission ID format issues
```

### **After Global Admin Token** (Expected)

```
Account Token: 6/7 tests pass (85.7%)
User Token:    2/7 tests pass (28.6%)
Overall:       8/14 tests pass (57.1%)

Self-Heal Results:
├── Account Token: ✅ Success (healed by global admin token)
└── User Token:    ✅ Success (healed by global admin token)
```

---

## 🚀 **Deployment Status**

- ✅ Code changes implemented
- ✅ TypeScript types updated
- ✅ Deployed to production (Version: `7454af62-6c22-441b-9fe6-96c66d21ce3b`)
- ⏳ **Waiting for**: User to add global admin token to `.dev.vars`
- ⏳ **Waiting for**: User to sync secret to production

---

## 📚 **Next Steps for User**

1. **Get your global Cloudflare API token**:
   - Go to [Cloudflare Dashboard → API Tokens](https://dash.cloudflare.com/profile/api-tokens)
   - Find your existing global token OR create a new one
   - Copy the token value

2. **Add to `.dev.vars`**:
   ```bash
   # Replace YOUR_GLOBAL_ADMIN_TOKEN_HERE with actual token
   CLOUDFLARE_GLOBAL_ADMIN_TOKEN="your_actual_token_here"
   ```

3. **Sync to production**:
   ```bash
   ./scripts/sync-secrets.sh production
   ```

4. **Test healing**:
   ```bash
   python3 scripts/test-cloudflare-token.py
   ```

5. **Verify in logs**:
   ```bash
   wrangler tail --env=production
   # Look for: "Using GLOBAL ADMIN token to modify ACCOUNT token"
   ```

---

## 📝 **Summary**

| Item | Status |
|------|--------|
| Code Implementation | ✅ Complete |
| TypeScript Types | ✅ Updated |
| Documentation | ✅ Created |
| Deployment | ✅ Deployed to production |
| User Action Required | ⏳ Add global token to `.dev.vars` |
| User Action Required | ⏳ Sync secret to production |
| Testing | ⏳ Pending user setup |

---

**Ready to enable true self-healing?** Follow the setup guide in [GLOBAL_ADMIN_TOKEN_SETUP.md](GLOBAL_ADMIN_TOKEN_SETUP.md)! 🎉

