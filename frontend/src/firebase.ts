/**
 * STANDARD BUILD — live backend adapter (Postgres). Same export surface as
 * the old mock so pages keep working unchanged.
 */
export * from './api/live';
export { api } from './api/apiClient';
