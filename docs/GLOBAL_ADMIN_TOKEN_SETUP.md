# Global Admin Token Setup Guide

**Date**: November 14, 2025  
**Purpose**: Enable true cross-token self-healing using a global admin token

---

## 🎯 **What is the Global Admin Token?**

The **Global Admin Token** is your personal Cloudflare API token with full permissions. It's used **exclusively** for self-healing other tokens (account & user tokens) when they're missing permissions.

### **Why Do We Need It?**

- **Problem**: The user token can only edit tokens it created or has explicit access to
- **Solution**: Use a global admin token that can see and edit **ALL** tokens in your account
- **Result**: True automated self-healing becomes possible

---

## 🔐 **How to Get Your Global Admin Token**

### **Option 1: Use Your Existing Global Token** ⭐ (Recommended)

If you already have a global Cloudflare API token with full permissions:

1. Find your global token in [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. Copy the token value
3. Add it to `.dev.vars`:

```bash
CLOUDFLARE_GLOBAL_ADMIN_TOKEN="your_global_token_here"
```

4. Sync to production:

```bash
# Sync all secrets including the new global admin token
./scripts/sync-secrets.sh production

# Or use the Python script
python3 scripts/manage-secrets.py --env production --keys CLOUDFLARE_GLOBAL_ADMIN_TOKEN
```

---

### **Option 2: Create a New Global Admin Token**

If you don't have a global token, create one:

1. Go to [Cloudflare Dashboard → API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **"Create Token"**
3. Choose **"Create Custom Token"**
4. Configure:
   - **Token name**: `Global Admin Token (Self-Healing)`
   - **Permissions**: 
     - All users - **API Tokens: Edit** ✅
   - **Account Resources**: 
     - Include: **All accounts** ✅
   - **Zone Resources**: 
     - Include: **All zones** (optional, for zone-level operations)
   - **IP Address Filtering**: Leave blank (or restrict to your IPs)
   - **TTL**: Never expire (or set a long expiration)

5. Click **"Continue to summary"**
6. Click **"Create Token"**
7. **Copy the token value** (you won't see it again!)
8. Add to `.dev.vars`:

```bash
CLOUDFLARE_GLOBAL_ADMIN_TOKEN="your_new_global_token_here"
```

9. Sync to production:

```bash
./scripts/sync-secrets.sh production
```

---

## 🔧 **How It Works**

### **Token Hierarchy**

```
┌─────────────────────────────────────────────────┐
│  GLOBAL ADMIN TOKEN (Your Personal Token)      │
│  ✅ Can see ALL tokens in the account          │
│  ✅ Can edit ALL tokens (including account &   │
│     user tokens)                                │
│  ✅ Used ONLY for self-healing                 │
└─────────────────────────────────────────────────┘
           │
           ├─ Heals ──────────────────────┐
           │                               │
           ▼                               ▼
┌──────────────────────┐    ┌──────────────────────┐
│  ACCOUNT TOKEN       │    │  USER TOKEN          │
│  (Worker Operations) │    │  (Token Management)  │
├──────────────────────┤    ├──────────────────────┤
│  ✅ Workers Scripts  │    │  ✅ List Tokens      │
│  ✅ D1 Databases     │    │  ✅ User Info        │
│  ✅ KV Namespaces    │    │  ✅ Token Ops        │
│  ✅ AI Models        │    │                      │
│  ✅ All Account Ops  │    │                      │
└──────────────────────┘    └──────────────────────┘
```

### **Healing Flow**

1. **Token Health Check** (every 6 hours via cron):
   - Checks account token permissions
   - Checks user token permissions
   - Identifies missing permissions

2. **Auto-Healing** (if permissions missing):
   - Uses **GLOBAL_ADMIN_TOKEN** to fetch token details
   - Fetches correct permission group IDs from Cloudflare API
   - Updates token policies with missing permissions
   - Logs results to D1 database

3. **Fallback**:
   - If `CLOUDFLARE_GLOBAL_ADMIN_TOKEN` is not set
   - Falls back to `CLOUDFLARE_USER_TOKEN`
   - Limited to tokens the user token can see

---

## ✅ **Verification**

After setting up the global admin token, verify it works:

### **1. Check Token is Set**

```bash
# Check local .dev.vars
grep CLOUDFLARE_GLOBAL_ADMIN_TOKEN .dev.vars

# Check production secret
wrangler secret list --env=production | grep CLOUDFLARE_GLOBAL_ADMIN_TOKEN
```

### **2. Test Self-Healing**

```bash
# Run Python test script (will auto-trigger heal)
python3 scripts/test-cloudflare-token.py
```

Expected output:
```
🔧 Auto-healing account token using GLOBAL ADMIN token...
✅ Successfully updated ACCOUNT token with X new permissions

🔧 Auto-healing user token using GLOBAL ADMIN token...
✅ Successfully updated USER token with X new permissions
```

### **3. Check Worker Logs**

```bash
# Tail production logs
wrangler tail --env=production

# Look for:
# "🔄 Cross-token healing: Using GLOBAL ADMIN token to modify ACCOUNT token"
# "✅ Successfully updated account token with X new permissions"
```

### **4. Manual Heal Test**

```bash
# Trigger manual heal via API
curl -X POST \
  -H "Authorization: Bearer YOUR_CLIENT_AUTH_TOKEN" \
  https://core-cloudflare-management-api.hacolby.workers.dev/tokens/heal | jq
```

Expected response:
```json
{
  "success": true,
  "message": "Successfully healed tokens (Account: +X perms, User: +Y perms)",
  "data": {
    "account_token": {
      "success": true,
      "permissions_added": ["..."],
      "message": "Successfully added X missing permissions using cross-token authentication"
    },
    "user_token": {
      "success": true,
      "permissions_added": ["..."],
      "message": "Successfully added Y missing permissions using cross-token authentication"
    }
  }
}
```

---

## 🔒 **Security Considerations**

### **Best Practices**

1. **Protect Your Global Token**:
   - ✅ Store in `.dev.vars` (gitignored)
   - ✅ Use Wrangler secrets for production
   - ❌ Never commit to git
   - ❌ Never share publicly

2. **Limit Token Scope**:
   - Only grant "API Tokens: Edit" permission
   - No need for zone-level permissions (unless you want them)
   - Set IP restrictions if possible

3. **Monitor Usage**:
   - Check token health logs in D1 database
   - Review healing attempts via `/tokens/history` endpoint
   - Set up alerts for failed healing attempts

4. **Rotate Regularly**:
   - Create new global token every 90 days
   - Update `.dev.vars` and sync to production
   - Revoke old token via dashboard

### **What If Token is Compromised?**

1. **Immediately revoke** via [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. Create a new global token
3. Update `.dev.vars`
4. Sync to production: `./scripts/sync-secrets.sh production`
5. Verify healing still works

---

## 📊 **Monitoring**

### **Check Token Health**

```bash
# Get current token health status
curl -H "Authorization: Bearer YOUR_CLIENT_AUTH_TOKEN" \
  https://core-cloudflare-management-api.hacolby.workers.dev/tokens/status | jq
```

### **View Healing History**

```bash
# Get last 10 healing attempts
curl -H "Authorization: Bearer YOUR_CLIENT_AUTH_TOKEN" \
  https://core-cloudflare-management-api.hacolby.workers.dev/tokens/history | jq
```

### **Check Cron Job Logs**

```bash
# Tail logs and filter for token health checks
wrangler tail --env=production | grep "token health"
```

---

## 🚀 **Next Steps**

1. ✅ Add your global admin token to `.dev.vars`
2. ✅ Sync to production: `./scripts/sync-secrets.sh production`
3. ✅ Test healing: `python3 scripts/test-cloudflare-token.py`
4. ✅ Verify logs: `wrangler tail --env=production`
5. ✅ Set up monitoring alerts (optional)

---

## 📚 **Related Documentation**

- [Cross-Token Healing Summary](CROSS_TOKEN_HEALING_SUMMARY.md)
- [Token Limitations](TOKEN_LIMITATIONS.md)
- [Token Manager Service](TOKEN_MANAGER.md)
- [Token Setup Guide](TOKEN_SETUP.md)

---

## ❓ **FAQ**

### **Q: Is the global admin token required?**
A: No, it's optional. If not set, the system falls back to using the user token (with limited visibility).

### **Q: Can I use my Cloudflare account's "Global API Key"?**
A: No, use an API Token, not the Global API Key. API Tokens are more secure and have granular permissions.

### **Q: Will this token be used for normal worker operations?**
A: No, it's used **only** for self-healing other tokens. Normal operations use the account token.

### **Q: What if I don't want to use a global token?**
A: That's fine! The system will use the user token as a fallback. You'll just have limited self-healing capabilities.

### **Q: How often does self-healing run?**
A: Automatically every 6 hours via cron job, or manually via `/tokens/heal` endpoint.

---

**Ready to enable true self-healing?** Add your global admin token and watch the magic happen! ✨

