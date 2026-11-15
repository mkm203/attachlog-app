// Lets `node --test` import the app's TypeScript with extension-less specifiers
// (the form Metro and tsc use), so the tests run the real source without a build step.
import { register } from 'node:module';

register(new URL('./resolve-ts.mjs', import.meta.url));
