# Cloudflare API Schema Reference

**Location**: `/Volumes/Projects/workers/core-cloudflare-management-api/api-schemas-main/common.yaml`

---

## 📚 **Overview**

This project includes the official Cloudflare API OpenAPI schema for reference and validation. The schema provides comprehensive documentation of all Cloudflare API endpoints, including:

- Endpoint paths and HTTP methods
- Request/response formats
- Authentication requirements
- Permission groups and scopes
- Error responses
- Parameter validation rules

---

## 🎯 **When to Use**

### **Development**
- ✅ Implementing new Cloudflare API integrations
- ✅ Understanding request/response structures
- ✅ Validating API parameters
- ✅ Checking authentication requirements

### **Testing**
- ✅ Writing accurate API tests
- ✅ Validating test responses
- ✅ Debugging API integration issues
- ✅ Verifying permission requirements

### **Documentation**
- ✅ Documenting API integrations
- ✅ Creating API usage examples
- ✅ Understanding error codes
- ✅ Explaining permission requirements

---

## 🔍 **Common Use Cases**

### **1. Finding Permission Groups**

```bash
# Search for permission groups in the schema
grep -A 10 "permission_groups" api-schemas-main/common.yaml
```

**Example**: When implementing token management, look up permission group names like:
- `Workers Scripts Write`
- `D1 Write`
- `API Tokens Write`

### **2. Checking Endpoint Paths**

```bash
# Find all endpoints related to tokens
grep -B 2 "/user/tokens" api-schemas-main/common.yaml
```

**Example Endpoints**:
- `GET /user/tokens` - List API tokens
- `GET /user/tokens/{token_id}` - Get token details
- `PUT /user/tokens/{token_id}` - Update token
- `GET /user/tokens/permission_groups` - List permission groups

### **3. Understanding Authentication**

Look for the `securitySchemes` section to understand:
- API Token authentication (`Bearer` token)
- Required headers
- Token scopes and permissions

### **4. Validating Request Bodies**

Check the `requestBody` schema for each endpoint to understand:
- Required fields
- Field types and formats
- Validation rules
- Example values

---

## 📖 **Schema Structure**

### **Main Sections**

```yaml
openapi: 3.0.0
info:
  title: Cloudflare API
  version: 4.0.0

servers:
  - url: https://api.cloudflare.com/client/v4

paths:
  /user/tokens:
    get: # List tokens
    post: # Create token
  /user/tokens/{token_id}:
    get: # Get token details
    put: # Update token
    delete: # Delete token

components:
  schemas:
    # Data models
  securitySchemes:
    # Authentication methods
```

---

## 💡 **Practical Examples**

### **Example 1: Token Permission Groups**

When implementing token healing, reference the schema to find:

```yaml
/user/tokens/permission_groups:
  get:
    summary: List Token Permission Groups
    description: Find all available permission groups for API Tokens
    responses:
      200:
        content:
          application/json:
            schema:
              type: object
              properties:
                result:
                  type: array
                  items:
                    type: object
                    properties:
                      id:
                        type: string
                        description: 32-character permission group ID
                      name:
                        type: string
                        description: Human-readable name
                      scopes:
                        type: array
                        items:
                          type: string
```

### **Example 2: Token Update Request**

When updating token permissions:

```yaml
/user/tokens/{token_id}:
  put:
    summary: Update Token
    requestBody:
      content:
        application/json:
          schema:
            type: object
            properties:
              name:
                type: string
              policies:
                type: array
                items:
                  type: object
                  properties:
                    effect:
                      type: string
                      enum: [allow, deny]
                    permission_groups:
                      type: array
                      items:
                        type: object
                        properties:
                          id:
                            type: string
                          scopes:
                            type: array
```

---

## 🔧 **Integration with Our Code**

### **Token Manager Service**

Our `TokenManagerService` (`src/services/token-manager.ts`) uses the schema to:

1. **Fetch Permission Groups**:
   ```typescript
   const response = await fetch(
     'https://api.cloudflare.com/client/v4/user/tokens/permission_groups',
     { headers: { Authorization: `Bearer ${token}` } }
   );
   ```

2. **Map Permission Names to IDs**:
   ```typescript
   const permGroup = permissionGroupsMap.get(required.name.toLowerCase());
   // Uses the 32-character ID from the schema
   ```

3. **Update Token Policies**:
   ```typescript
   const updateResponse = await fetch(
     `https://api.cloudflare.com/client/v4/user/tokens/${tokenId}`,
     {
       method: 'PUT',
       body: JSON.stringify({ name, policies })
     }
   );
   ```

---

## 🔄 **Keeping Schema Up-to-Date**

### **Update Process**

1. **Check for updates**:
   ```bash
   cd api-schemas-main
   git fetch origin
   git log HEAD..origin/main --oneline
   ```

2. **Pull latest changes**:
   ```bash
   git pull origin main
   ```

3. **Verify compatibility**:
   ```bash
   # Run tests to ensure our code still works
   npm test
   python3 scripts/test-cloudflare-token.py
   ```

4. **Update code if needed**:
   - Check for new permission groups
   - Verify endpoint paths haven't changed
   - Update request/response types if needed

---

## 📝 **Best Practices**

### **DO**
- ✅ Consult the schema before implementing new API calls
- ✅ Use exact endpoint paths from the schema
- ✅ Validate request/response structures against the schema
- ✅ Reference schema examples in documentation
- ✅ Keep the schema submodule up-to-date

### **DON'T**
- ❌ Hardcode API endpoint paths without checking the schema
- ❌ Guess at request/response formats
- ❌ Assume permission group names without verification
- ❌ Ignore schema validation errors

---

## 🐛 **Troubleshooting**

### **Issue: API returns 400 Bad Request**
**Solution**: Check the schema for required fields and validation rules

### **Issue: Permission group not found**
**Solution**: Search the schema for the correct permission group name and ID

### **Issue: Authentication error**
**Solution**: Verify the authentication scheme in the `securitySchemes` section

### **Issue: Endpoint not found (404)**
**Solution**: Confirm the endpoint path matches the schema exactly

---

## 📚 **Additional Resources**

- [Cloudflare API Documentation](https://developers.cloudflare.com/api/)
- [Cloudflare API Schemas GitHub](https://github.com/cloudflare/api-schemas)
- [OpenAPI Specification](https://swagger.io/specification/)
- [Token Manager Service](TOKEN_MANAGER.md)
- [Token Setup Guide](TOKEN_SETUP.md)

---

## 🎯 **Quick Reference**

| Task | Command/Location |
|------|-----------------|
| **Find endpoint** | `grep -B 2 "/endpoint/path" api-schemas-main/common.yaml` |
| **List permission groups** | Search for `permission_groups` in schema |
| **Check authentication** | Look for `securitySchemes` section |
| **Validate request** | Find endpoint → check `requestBody` schema |
| **Understand response** | Find endpoint → check `responses` section |
| **Update schema** | `cd api-schemas-main && git pull origin main` |

---

**Remember**: The schema is your source of truth for all Cloudflare API integrations! 🚀

