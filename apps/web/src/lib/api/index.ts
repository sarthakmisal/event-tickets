import { createHttpApi } from './http';
import { createMemoryApi } from './memory/memoryApi';
import type { DemoControls } from './memory/memoryApi';
import type { Api } from './types';

export { ApiError } from './types';
export type { Api } from './types';
export type { DemoControls } from './memory/memoryApi';

// `__DEMO__` is a build-time constant: the demo build runs on the in-memory API, the real build never ships it.
const memory = __DEMO__ ? createMemoryApi() : null;

export const api: Api = memory ? memory.api : createHttpApi();
export const demo: DemoControls | null = memory?.demo ?? null;
