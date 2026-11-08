import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Morph, initAz } from '../src/core/morph.js';
import { acquireAz } from '../src/core/loader.js';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));

export const loadVendoredAz = async () => {
    const Az = require(path.join(root, 'vendor/az/az.min.js'));
    await initAz(Az, path.join(root, 'dicts'));
    return Az;
};

let morphPromise = null;

// Uses the vendored Az.js and dictionaries, the same files users get.
export function getMorph() {
    if (!morphPromise) {
        morphPromise = acquireAz({ owner: 'test', load: loadVendoredAz }).promise.then((Az) => new Morph(Az));
    }
    return morphPromise;
}
