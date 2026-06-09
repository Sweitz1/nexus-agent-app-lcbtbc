import { createApplication } from '@specific-dev/framework';
import * as appSchema from './db/schema/schema.js';
import * as authSchema from './db/schema/auth-schema.js';
import { register as registerProviders } from './routes/providers.js';
import { register as registerCustomApis } from './routes/customApis.js';
import { register as registerPermissions } from './routes/permissions.js';
import { register as registerTasks } from './routes/tasks.js';
import { register as registerMemory } from './routes/memory.js';
import { register as registerLogs } from './routes/logs.js';
import { register as registerGithub } from './routes/github.js';
import { register as registerRuntime } from './routes/runtime.js';

const schema = { ...appSchema, ...authSchema };

export const app = await createApplication(schema);

export type App = typeof app;

app.withAuth();

registerProviders(app, app.fastify);
registerCustomApis(app, app.fastify);
registerPermissions(app, app.fastify);
registerTasks(app, app.fastify);
registerMemory(app, app.fastify);
registerLogs(app, app.fastify);
registerGithub(app, app.fastify);
registerRuntime(app, app.fastify);

await app.run();
app.logger.info('Nexus Agent backend running');
