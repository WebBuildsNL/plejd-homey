#!/usr/bin/env node
/**
 * Rondje door de BLE-laag: commando's coderen met de encoder van de app en
 * daarna weer parsen alsof het mesh ze terugmeldt. Geen Homey en geen echte
 * site-data nodig; de sleutel hieronder is een testsleutel.
 *
 * Bewaakt vooral dit: een kale aan/uit-melding bevat geen dimwaarde. Wie daar
 * toch een getal van maakt, zet de helderheid stilletjes op 100% en laat
 * dim_changed-flows afgaan terwijl er niemand aan de dimmer heeft gezeten.
 *
 * Gebruik: node tools/test-notifications.cjs
 */

'use strict';

const assert = require('node:assert');

const { Commands } = require('../lib/plejd');

const TEST_KEY = '00112233-4455-6677-8899-aabbccddeeff';
const TEST_ADDRESS = 'DEE3CA832006';
const DEVICE = 11;

const silent = { log: () => {}, error: () => {} };
const commands = new Commands(TEST_KEY, TEST_ADDRESS, null, silent);

const cases = [
  {
    what: 'uitschakelen (STATE_CHANGE, geen dim-payload)',
    packet: () => commands.deviceOff(DEVICE),
    expect: { state: false, dim: null },
  },
  {
    what: 'inschakelen zonder helderheid (STATE_CHANGE)',
    packet: () => commands.deviceOn(DEVICE),
    expect: { state: true, dim: null },
  },
  {
    what: 'inschakelen op 30% (DIM2_CHANGE)',
    packet: () => commands.deviceOn(DEVICE, 77),
    expect: { state: true, dim: 77 },
  },
  {
    what: 'inschakelen op 100% (DIM2_CHANGE)',
    packet: () => commands.deviceOn(DEVICE, 255),
    expect: { state: true, dim: 255 },
  },
];

let failures = 0;

for (const testCase of cases) {
  const parsed = commands.notificationParse(testCase.packet());

  try {
    assert.ok(parsed, 'melding kon niet geparsed worden');
    assert.strictEqual(parsed.id, DEVICE, 'verkeerd mesh-adres');
    assert.strictEqual(parsed.cmd, 'state', 'verkeerd commandotype');
    assert.strictEqual(parsed.state, testCase.expect.state, 'verkeerde aan/uit-status');
    assert.strictEqual(parsed.dim, testCase.expect.dim, 'verkeerde dimwaarde');

    console.log(`ok    ${testCase.what}`);
    console.log(`        state=${parsed.state} dim=${parsed.dim}`);
  } catch (err) {
    failures++;
    console.log(`FOUT  ${testCase.what}`);
    console.log(`        ${err.message}`);
    console.log(`        gekregen: ${JSON.stringify(parsed)}`);
  }
}

if (failures > 0) {
  console.log(`\n${failures} van de ${cases.length} gefaald.`);
  process.exit(1);
}

console.log(`\nAlle ${cases.length} geslaagd.`);
