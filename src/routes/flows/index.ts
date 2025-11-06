import { Hono } from 'hono';
import { Env, Variables } from '../../types';

// Import flow modules
import tokenFlows from './token';
import projectFlows from './project';
import healthFlows from './health';
import cicdFlows from './cicd';

const flows = new Hono<{ Bindings: Env; Variables: Variables }>();

// Mount flow routers - these provide high-level orchestration and business logic
flows.route('/token', tokenFlows);
flows.route('/project', projectFlows);
flows.route('/health', healthFlows);
flows.route('/cicd', cicdFlows);

export default flows;
