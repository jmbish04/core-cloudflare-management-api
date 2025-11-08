import { Hono } from 'hono';
import { Env, Variables } from '../../types';
import { CloudflareApiClient } from './apiClient';

const tokens = new Hono<{ Bindings: Env; Variables: Variables }>();

// List tokens created by the user
tokens.get('/', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const response = await apiClient.get('/user/tokens');
    return c.json(response);
  } catch (error: any) {
    return c.json(
      { success: false, error: error.message },
      error.status || 500
    );
  }
});

// Verify the token making the request
tokens.get('/verify', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const response = await apiClient.get('/user/tokens/verify');
    return c.json(response);
  } catch (error: any) {
    const status = error.status === 401 ? 401 : error.status || 500;
    return c.json({ success: false, error: error.message }, status);
  }
});

// Comprehensive token test - tests both user and account token verification
tokens.post('/test', async (c) => {
  try {
    const accountId = c.get('accountId');
    const body = await c.req.json();
    const tokenToTest = body.token; // Optional: test a specific token, otherwise uses the request token
    
    const results: any = {
      tested_at: new Date().toISOString(),
      user_token_test: null,
      account_token_test: null,
      token_provided: !!tokenToTest,
    };

    // Create API client with the token to test (if provided) or use existing one
    let apiClient: CloudflareApiClient;
    if (tokenToTest) {
      apiClient = new CloudflareApiClient({ apiToken: tokenToTest });
    } else {
      apiClient = c.get('apiClient') as CloudflareApiClient;
    }

    // Test 1: User Token Verification
    try {
      const userVerifyStart = Date.now();
      const userResponse: any = await apiClient.get('/user/tokens/verify');
      const userVerifyTime = Date.now() - userVerifyStart;

      results.user_token_test = {
        success: true,
        status: 200,
        response_time_ms: userVerifyTime,
        result: userResponse.result || userResponse,
        verified: true,
        message: 'User token verified successfully',
      };
    } catch (error: any) {
      results.user_token_test = {
        success: false,
        status: error.status || 500,
        response_time_ms: 0,
        error: error.message,
        verified: false,
        message: `User token verification failed: ${error.message}`,
      };
    }

    // Test 2: Account Token Verification
    try {
      const accountVerifyStart = Date.now();
      const accountResponse: any = await apiClient.get(`/accounts/${accountId}/tokens/verify`);
      const accountVerifyTime = Date.now() - accountVerifyStart;

      results.account_token_test = {
        success: true,
        status: 200,
        response_time_ms: accountVerifyTime,
        result: accountResponse.result || accountResponse,
        verified: true,
        message: 'Account token verified successfully',
      };
    } catch (error: any) {
      results.account_token_test = {
        success: false,
        status: error.status || 500,
        response_time_ms: 0,
        error: error.message,
        verified: false,
        message: `Account token verification failed: ${error.message}`,
      };
    }

    // Test 3: Get Token Details (if user token test succeeded)
    if (results.user_token_test?.verified && results.user_token_test?.result?.id) {
      try {
        const tokenId = results.user_token_test.result.id;
        const tokenDetailsStart = Date.now();
        const tokenDetails: any = await apiClient.get(`/user/tokens/${tokenId}`);
        const tokenDetailsTime = Date.now() - tokenDetailsStart;

        results.token_details = {
          success: true,
          status: 200,
          response_time_ms: tokenDetailsTime,
          result: tokenDetails.result || tokenDetails,
        };
      } catch (error: any) {
        results.token_details = {
          success: false,
          status: error.status || 500,
          error: error.message,
        };
      }
    }

    // Determine overall success
    const userVerified = results.user_token_test?.verified === true;
    const accountVerified = results.account_token_test?.verified === true;
    results.overall_success = userVerified && accountVerified;
    results.overall_status = results.overall_success ? 'pass' : 'partial';

    return c.json({
      success: true,
      result: results,
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: error.message,
        details: error,
      },
      500
    );
  }
});

// Get metadata for a specific token
tokens.get('/:tokenId', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const tokenId = c.req.param('tokenId');

    const response = await apiClient.get(`/user/tokens/${tokenId}`);
    return c.json(response);
  } catch (error: any) {
    const status = error.status === 404 ? 404 : error.status || 500;
    return c.json({ success: false, error: error.message }, status);
  }
});

// Create a new token
tokens.post('/', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const body = await c.req.json();

    const response = await apiClient.post('/user/tokens', body);
    return c.json(response, 201);
  } catch (error: any) {
    return c.json(
      { success: false, error: error.message },
      error.status || 500
    );
  }
});

// Delete a token
tokens.delete('/:tokenId', async (c) => {
  try {
    const apiClient = c.get('apiClient') as CloudflareApiClient;
    const tokenId = c.req.param('tokenId');

    await apiClient.delete(`/user/tokens/${tokenId}`);
    return c.json({ success: true, result: { id: tokenId } });
  } catch (error: any) {
    const status = error.status === 404 ? 404 : error.status || 500;
    return c.json({ success: false, error: error.message }, status);
  }
});

export default tokens;
