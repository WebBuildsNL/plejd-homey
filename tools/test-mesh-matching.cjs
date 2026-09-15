#!/usr/bin/env node
/**
 * Controleert welke BLE-advertenties de app als Plejd-mesh herkent.
 *
 * Aanleiding: een dimmer adverteerde zichzelf als "P mesh DEE3CA832006" terwijl
 * de app exact op "P mesh" vergeleek. Zodra het opgeslagen mesh-adres was
 * gewist, kon de app het mesh nooit meer vinden en bleef het apparaat
 * onbeschikbaar. Bereik was daarbij niet het probleem.
 *
 * Gebruik: node tools/test-mesh-matching.cjs
 */

const assert = require('node:assert');
const Module = require('node:module');

// app.js verwacht de 'homey'-module, die alleen op een Homey bestaat.
const originalLoad = Module._load;
Module._load = function load(request, ...rest) {
  if (request === 'homey') {
    return { App: class {}, Device: class {}, Driver: class {} };
  }

  return originalLoad.call(this, request, ...rest);
};

const PlejdApp = require('../app');

Module._load = originalLoad;

const PAIRED_DEVICE_ID = 'DEE3CA832006';

const app = {
  devicesList: [{ getData: () => ({ id: PAIRED_DEVICE_ID }) }],
  _normalizeBleId: PlejdApp.prototype._normalizeBleId,
};

function matches(advertisement) {
  return PlejdApp.prototype._isPlejdMeshAdvertisement.call(app, advertisement);
}

const cases = [
  {
    what: 'volledige naam, zoals de ingebouwde dimmer adverteert',
    advertisement: { localName: 'P mesh DEE3CA832006', uuid: 'dee3ca832006' },
    expect: true,
  },
  {
    what: 'verkorte naam, zoals hetzelfde apparaat soms adverteert',
    advertisement: { localName: 'P mesh', uuid: 'dee3ca832006' },
    expect: true,
  },
  {
    what: 'helemaal geen naam, wel het adres van een gekoppeld apparaat',
    advertisement: { uuid: 'DE:E3:CA:83:20:06' },
    expect: true,
  },
  {
    what: 'ander Plejd-apparaat in het mesh dat niet gekoppeld is',
    advertisement: { localName: 'P mesh AABBCCDDEEFF', uuid: 'aabbccddeeff' },
    expect: true,
  },
  {
    what: 'willekeurig ander bluetooth-apparaat',
    advertisement: { localName: 'Bose QC45', uuid: 'aabbccddeeff' },
    expect: false,
  },
  {
    what: 'apparaat zonder naam en zonder bekend adres',
    advertisement: { uuid: '001122334455' },
    expect: false,
  },
];

let failures = 0;

for (const testCase of cases) {
  const result = matches(testCase.advertisement);

  try {
    assert.strictEqual(result, testCase.expect);
    console.log(`ok    ${testCase.what}`);
  } catch (err) {
    failures++;
    console.log(`FOUT  ${testCase.what}`);
    console.log(`        verwacht ${testCase.expect}, kreeg ${result}`);
    console.log(`        ${JSON.stringify(testCase.advertisement)}`);
  }
}

if (failures > 0) {
  console.log(`\n${failures} van de ${cases.length} gefaald.`);
  process.exit(1);
}

console.log(`\nAlle ${cases.length} geslaagd.`);
