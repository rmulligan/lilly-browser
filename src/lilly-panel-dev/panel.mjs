import { createIntegratedFixture } from '../lilly-presence/integrated-fixture.mjs';
import { createMockProvider } from '../lilly-presence/mock-provider.mjs';
import { mountPanel } from './session-ui.mjs';
const event = (type, value = '') => JSON.stringify({ type, value });
const events = [event('text', 'The captured observation is available in this mock turn. This fixed response is not model reasoning.'), event('end')];
const provider = createMockProvider(Array.from({ length: 16 }, () => ({ events })));
// Random identities are local to this panel incarnation, not durable browser identity.
const runtime = createIntegratedFixture({ api: chrome, browserId: 'panel-' + crypto.randomUUID(), workerId: 'runtime-' + crypto.randomUUID(), provider });
mountPanel({ api: chrome, document, window, runtime });
