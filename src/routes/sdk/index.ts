import { Hono } from 'hono';
import { Env, Variables } from '../../types';

// Import SDK route modules
import workersRouter from './workers';
import storageRouter from './storage';
import tokensRouter from './tokens';
import pagesRouter from './pages';
import cicdRouter from './cicd';

const sdk = new Hono<{ Bindings: Env; Variables: Variables }>();

// Mount SDK routers - these are 1:1 proxies to Cloudflare API
sdk.route('/workers', workersRouter);
sdk.route('/storage', storageRouter);
sdk.route('/tokens', tokensRouter);
sdk.route('/pages', pagesRouter);
sdk.route('/cicd', cicdRouter);

export default sdk;
