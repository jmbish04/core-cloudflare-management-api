import { Hono } from 'hono';
import { Env, Variables } from '../../types';

// Import flow modules
import tokenFlows from './token';
import projectFlows from './project';

const flows = new Hono<{ Bindings: Env; Variables: Variables }>();

// Mount flow routers - these provide high-level orchestration and business logic
flows.route('/token', tokenFlows);
flows.route('/project', projectFlows);

export default flows;
