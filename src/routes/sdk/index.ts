import { OpenAPIHono } from '@hono/zod-openapi';
import { Env, Variables } from '../../types';

// Import all SDK route modules
import workersRouter from './workers';
import pagesRouter from './pages';
import tunnelsRouter from './tunnels';
import tokensRouter from './tokens';
import dnsRouter from './dns';
import accessRouter from './access';
import zonesRouter from './zones';
import storageRouter from './storage';

const app = new OpenAPIHono<{ Bindings: Env; Variables: Variables }>();

// Mount SDK routers
app.route('/workers', workersRouter);
app.route('/pages', pagesRouter);
app.route('/tunnels', tunnelsRouter);
app.route('/tokens', tokensRouter);
app.route('/dns', dnsRouter);
app.route('/access', accessRouter);
app.route('/zones', zonesRouter);
app.route('/storage', storageRouter);

export default app;
