#!/usr/bin/env node
/**
 * Plejd site dumper - draait volledig lokaal op je Mac.
 *
 * Doet exact wat de Homey-app eenmalig bij het koppelen doet: inloggen op de
 * Plejd cloud en de site-definitie ophalen. Daarin zitten:
 *   - de cryptoKey van je mesh (nodig om BLE-commando's te versleutelen)
 *   - per device het BLE mesh-adres, hardwareId, firmware-naam en traits
 *
 * Daarna heb je de cloud niet meer nodig: aansturen gaat 100% over bluetooth.
 *
 * Gebruik:
 *   node tools/plejd-dump.mjs                 # vraagt om e-mail + wachtwoord
 *   PLEJD_USER=.. PLEJD_PASS=.. node tools/plejd-dump.mjs
 *
 * Output: plejd-site.json (volledige ruwe dump) + een overzicht in de terminal.
 */

import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const API_APP_ID = 'zHtVqXt8k4yFyk2QGmgp48D9xZr2G94xWYnF4dak';
const API_BASE_URL = 'https://cloud.plejd.com/parse/';

function ask(question, { hidden = false } = {}) {
  return new Promise((res) => {
    let muted = false;
    const output = new Writable({
      write(chunk, encoding, callback) {
        if (!muted) process.stdout.write(chunk, encoding);
        callback();
      },
    });
    const rl = createInterface({ input: process.stdin, output, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      res(answer.trim());
    });
    if (hidden) muted = true;
  });
}

async function post(path, body, headers = {}) {
  const res = await fetch(API_BASE_URL + path, {
    method: 'POST',
    headers: {
      'X-Parse-Application-Id': API_APP_ID,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

const TRAITS = [
  [0x01, 'POWER'],
  [0x02, 'DIM'],
  [0x04, 'TEMP'],
  [0x08, 'GROUP'],
  [0x10, 'COVER'],
  [0x20, 'CLIMATE'],
  [0x40, 'TILT'],
  [0x80, 'CLIMATE_PWM'],
];

function decodeTraits(t) {
  const n = Number(t) || 0;
  const on = TRAITS.filter(([bit]) => (n & bit) === bit).map(([, name]) => name);
  return `${n} (0x${n.toString(16)})${on.length ? ' = ' + on.join(' | ') : ''}`;
}

const main = async () => {
  const username = (process.env.PLEJD_USER || (await ask('Plejd e-mail: '))).toLowerCase();
  const password = process.env.PLEJD_PASS || (await ask('Plejd wachtwoord: ', { hidden: true }));

  process.stdout.write('\nInloggen... ');
  const login = await post('login', { username, password });
  const sessionToken = login.sessionToken;
  console.log('ok');

  const auth = { 'X-Parse-Session-Token': sessionToken };

  const siteList = await post('functions/getSiteList', {}, auth);
  const sites = siteList.result.map((x) => ({ title: x.site.title, id: x.site.siteId }));
  console.log(`\nSites gevonden: ${sites.map((s) => `${s.title} (${s.id})`).join(', ')}`);

  let chosen = sites[0];
  if (sites.length > 1) {
    sites.forEach((s, i) => console.log(`  [${i}] ${s.title}`));
    const idx = Number(await ask('Welke site? '));
    chosen = sites[idx] ?? sites[0];
  }

  const detail = await post('functions/getSiteById', { siteId: chosen.id }, auth);
  const site = detail.result[0];

  const outPath = resolve(process.cwd(), 'plejd-site.json');
  writeFileSync(outPath, JSON.stringify(detail, null, 2));

  const rooms = Object.fromEntries((site.rooms || []).map((r) => [r.roomId, r.title]));

  console.log('\n' + '='.repeat(78));
  console.log(`SITE: ${site.site.title}`);
  console.log(`CRYPTO KEY: ${site.plejdMesh.cryptoKey}`);
  console.log(`MESH KEY:   ${site.plejdMesh.meshKey}`);
  console.log('='.repeat(78));

  for (const device of site.devices || []) {
    const pd = (site.plejdDevices || []).find((x) => x.deviceId === device.deviceId) || {};
    const outputs = (site.outputSettings || []).filter((x) => x.deviceParseId === device.objectId);
    const inputs = (site.inputSettings || []).filter((x) => x.deviceId === device.deviceId);

    let address = site.deviceAddress?.[device.deviceId];
    const addrNote = [];
    for (const s of outputs) {
      const oa = site.outputAddress?.[device.deviceId];
      if (oa && s.output != null && oa[s.output] != null) {
        address = oa[s.output];
        addrNote.push(`output ${s.output} -> adres ${oa[s.output]}`);
      }
    }

    console.log('\n' + '-'.repeat(78));
    console.log(`NAAM        : ${device.title}${device.roomId && rooms[device.roomId] ? `  (kamer: ${rooms[device.roomId]})` : ''}`);
    console.log(`BLE deviceId: ${device.deviceId}`);
    console.log(`MESH adres  : ${address}${addrNote.length ? '   [' + addrNote.join(', ') + ']' : ''}`);
    console.log(`hardwareId  : ${pd.hardwareId}`);
    console.log(`MODEL (fw)  : ${pd.firmware?.notes ?? '?'}   fw-versie: ${pd.firmware?.version ?? '?'}`);
    console.log(`outputType  : ${device.outputType ?? '(niet gezet)'}`);
    console.log(`traits      : ${decodeTraits(device.traits)}`);
    if (pd.isFellowshipFollower) console.log('LET OP      : isFellowshipFollower = true (volgt een ander device)');
    if (device.hiddenFromIntegrations) console.log('LET OP      : hiddenFromIntegrations = true');

    for (const s of outputs) {
      const bits = [];
      if (s.colorTemperature) bits.push(`colorTemperature ${s.colorTemperature.minTemperature}-${s.colorTemperature.maxTemperature}K (${s.colorTemperature.behavior})`);
      if (s.climateSettings) bits.push(`climateSettings ${s.climateSettings.regulationMode}`);
      if (s.coverableSettings) bits.push('coverableSettings');
      if (s.predefinedLoad?.loadType) bits.push(`load ${s.predefinedLoad.loadType}`);
      if (s.dimCurve) bits.push(`dimCurve ${s.dimCurve}`);
      console.log(`  output ${s.output}: ${bits.length ? bits.join(', ') : '(geen bijzondere settings)'}`);
    }
    for (const s of inputs) {
      const ia = site.inputAddress?.[device.deviceId];
      console.log(`  input  ${s.input}: buttonType=${s.buttonType || '-'}${s.motionSensorData ? ' motionSensorData' : ''}${ia ? ` adres=${JSON.stringify(ia[s.input] ?? ia)}` : ''}`);
    }
  }

  console.log('\n' + '='.repeat(78));
  console.log(`Volledige ruwe dump geschreven naar: ${outPath}`);
  console.log('Let op: dat bestand bevat je cryptoKey. Niet delen / niet committen.');
  console.log('='.repeat(78));
};

main().catch((err) => {
  console.error('\nFOUT:', err.message);
  process.exit(1);
});
