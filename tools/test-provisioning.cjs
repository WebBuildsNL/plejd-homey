#!/usr/bin/env node
/**
 * Draait de echte provisioning- en pairing-code van deze app tegen
 * plejd-site.json, met een nagebootste homey.settings. Zo weten we of het werkt
 * voordat we iets op de Homey installeren.
 *
 * Gebruik: node tools/test-provisioning.cjs [pad/naar/plejd-site.json]
 */

'use strict';

const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert');

const provisioning = require('../lib/provisioning');
const apiHandlers = require('../api');

const ROOT = resolve(__dirname, '..');

// Minimale nabootsing van wat de app van Homey gebruikt.
const store = new Map();
const homey = {
  settings: {
    get: (key) => (store.has(key) ? store.get(key) : null),
    set: (key, value) => store.set(key, value),
    unset: (key) => store.delete(key),
  },
  app: { log: (...args) => console.log('   [app]', ...args) },
};

const sitePath = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : resolve(ROOT, 'plejd-site.json');

const raw = JSON.parse(readFileSync(sitePath, 'utf8'));

const run = async () => {
  console.log('1. Status voordat er iets is ingesteld');
  let state = await apiHandlers.getSummary({ homey });
  assert.strictEqual(state.configured, false, 'zou nog niet ingesteld moeten zijn');
  console.log('   configured:', state.configured, '-> ok');

  console.log('\n2. Koppelen zonder site-gegevens moet een nette fout geven');
  try {
    provisioning.listDevices(homey, 'plejd');
    assert.fail('had moeten falen');
  } catch (err) {
    assert.match(err.message, /app-instellingen/);
    console.log('   fout:', err.message, '-> ok');
  }

  console.log('\n3. Onzin-JSON opslaan moet een nette fout geven');
  for (const bad of [{ hello: 'world' }, { result: [{ devices: [] }] }, 'nonsense']) {
    try {
      await apiHandlers.saveSite({ homey, body: { site: bad } });
      assert.fail('had moeten falen');
    } catch (err) {
      console.log('   geweigerd:', err.message);
    }
  }
  assert.strictEqual(store.has('siteData'), false, 'mag niets hebben opgeslagen');
  console.log('   niets opgeslagen -> ok');

  console.log('\n4. Echte site-JSON opslaan');
  state = await apiHandlers.saveSite({ homey, body: { site: raw } });
  assert.strictEqual(state.configured, true);
  assert.ok(store.get('cryptokey'), 'cryptokey moet gezet zijn');
  console.log('   site:', state.summary.title);
  console.log('   apparaten:', state.summary.deviceCount, ' scenes:', state.summary.sceneCount);
  console.log('   cryptokey gezet:', `${String(store.get('cryptokey')).slice(0, 5)}...`);

  console.log('\n5. Apparatenlijst per koppelscherm');
  for (const driver of ['plejd', 'button', 'cover', 'motion', 'thermostat']) {
    const devices = provisioning.listDevices(homey, driver);
    console.log(`   ${driver.padEnd(11)} -> ${devices.length} device(s)`);
    for (const device of devices) {
      console.log('     ', JSON.stringify(device));
    }
  }

  console.log('\n6. Scenes');
  console.log('   ', JSON.stringify(provisioning.getScenes(homey)));

  console.log('\n7. Wissen');
  state = await apiHandlers.clearSite({ homey });
  assert.strictEqual(state.configured, false);
  assert.strictEqual(store.has('cryptokey'), false, 'cryptokey moet weg zijn');
  console.log('   configured:', state.configured, ', cryptokey weg -> ok');

  console.log('\nAlles geslaagd.');
};

run().catch((err) => {
  console.error('\nGEFAALD:', err.message);
  process.exit(1);
});
