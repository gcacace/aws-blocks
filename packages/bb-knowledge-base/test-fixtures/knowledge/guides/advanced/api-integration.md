# Advanced API Integration

This guide covers advanced topics for integrating with our REST API.

Authentication uses OAuth 2.0 with Bearer tokens. Request a token from the /auth/token endpoint using your client credentials.

Rate limiting is enforced at 1000 requests per minute per API key. If you exceed this limit, you will receive a 429 status code.

For webhook integrations, configure your endpoint URL in the developer portal. Webhooks are signed with HMAC-SHA256 for verification.

Pagination follows cursor-based pagination. Include the cursor parameter from the previous response to fetch the next page of results.
