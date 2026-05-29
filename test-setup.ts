// Registers happy-dom globals (window, document, localStorage, etc.) for `bun test`,
// so DOM-dependent modules (persistence, Preact components) can be tested.
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();
