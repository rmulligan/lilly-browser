import { createFixtureParticipation } from '../lilly-presence/fixture-participation.mjs';
import { mountParticipation } from './participation-ui.mjs';
const runtime = createFixtureParticipation({ api: chrome, browserId: 'panel-' + crypto.randomUUID(), workerId: 'runtime-' + crypto.randomUUID() });
mountParticipation({ api: chrome, document, window, runtime });
