CREATE TABLE `api_permissions_map` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`permission` text NOT NULL,
	`base_path` text NOT NULL,
	`description` text
);
--> statement-breakpoint
-- Insert mappings for Cloudflare token scopes
INSERT INTO `api_permissions_map` (`permission`, `base_path`, `description`) VALUES
('MCP Portals:Edit', '/accounts/{account_id}/mcp/portals', 'Manage Model Context Protocol portals and linked servers'),
('Workers R2 SQL:Read', '/accounts/{account_id}/r2/sql', 'Query R2 datasets using SQL-like endpoints'),
('Workers Agents Configuration:Edit', '/accounts/{account_id}/workers/agents', 'Manage agent configuration for Workers AI or service bindings'),
('Containers:Edit', '/accounts/{account_id}/containers', 'Create and manage containerized runtimes'),
('Workers Observability:Edit', '/accounts/{account_id}/workers/observability', 'Configure Workers logs, traces, and metrics collection'),
('Workers R2 Data Catalog:Edit', '/accounts/{account_id}/r2/catalog', 'Manage schema and catalog metadata for R2 datasets'),
('Secrets Store:Edit', '/accounts/{account_id}/secrets-store/secrets', 'Create, update, and delete secrets for bindings'),
('AI Search:Edit', '/accounts/{account_id}/ai/search', 'Create and manage AI Search indices and queries'),
('Browser Rendering:Edit', '/accounts/{account_id}/browser-rendering/sessions', 'Run and manage headless browser render sessions'),
('Workers Builds Configuration:Edit', '/accounts/{account_id}/workers/builds', 'Manage build triggers, configurations, and uploads'),
('Workers Pipelines:Edit', '/accounts/{account_id}/workers/pipelines', 'Define or modify multi-step Worker build and deploy pipelines'),
('AI Gateway:Edit', '/accounts/{account_id}/ai/gateway', 'Configure AI Gateway routes and usage policies'),
('Workers AI:Edit', '/accounts/{account_id}/ai', 'Manage AI model deployments and usage under Workers AI'),
('Queues:Edit', '/accounts/{account_id}/queues', 'Create and manage message queues'),
('Vectorize:Edit', '/accounts/{account_id}/vectorize/indexes', 'Manage vector databases and embedding indexes'),
('Hyperdrive:Edit', '/accounts/{account_id}/hyperdrive/connections', 'Configure and manage Hyperdrive database caching connections'),
('Account: SSL and Certificates:Edit', '/zones/{zone_id}/ssl', 'Manage SSL/TLS certificates for zones'),
('API Tokens:Edit', '/user/tokens', 'Create, rotate, and revoke Cloudflare API tokens'),
('D1:Edit', '/accounts/{account_id}/d1/databases', 'Manage D1 databases, queries, and migrations'),
('Pub/Sub:Edit', '/accounts/{account_id}/pubsub', 'Create and manage publish/subscribe channels'),
('Email Routing Addresses:Edit', '/accounts/{account_id}/email/routing', 'Manage routed email addresses'),
('Cloudflare Pages:Edit', '/accounts/{account_id}/pages/projects', 'Manage Pages projects and deployments'),
('Workers R2 Storage:Edit', '/accounts/{account_id}/r2/buckets', 'Create, delete, and manage R2 object storage buckets'),
('Cloudflare Images:Edit', '/accounts/{account_id}/images/v1', 'Upload, modify, and delete stored images'),
('Workers Tail:Read', '/accounts/{account_id}/workers/scripts/{script_name}/tails', 'View real-time Workers logs (read-only)'),
('Cloudflare Tunnel:Edit', '/accounts/{account_id}/tunnels', 'Create and manage Argo Tunnels for secure connectivity'),
('Access: Service Tokens:Edit', '/accounts/{account_id}/access/service_tokens', 'Manage Cloudflare Access service tokens'),
('Workers KV Storage:Edit', '/accounts/{account_id}/storage/kv/namespaces', 'Create, update, and delete KV namespaces and keys'),
('Workers Scripts:Edit', '/accounts/{account_id}/workers/scripts', 'Upload, update, or delete Cloudflare Worker scripts');
