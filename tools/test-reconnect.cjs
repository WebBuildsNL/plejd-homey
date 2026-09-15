#!/usr/bin/env node
/**
 * Bootst na wat er gebeurt als een BLE-verbinding wegvalt tijdens service
 * discovery: het 'disconnect'-event van de peripheral en de catch rond
 * getService roepen allebei reconnect() aan, in dezelfde tick.
 *
 * Gebruikt de echte reconnect() en disconnect() uit app.js. Alleen Homey's
 * timers en de BLE-laag zijn nagebootst. Er mag daarna precies één
 * connect()-poging lopen. Twee betekent twee ketens die elkaars verbinding
 * afbreken, zoals in de logs van 15 september: elke regel dubbel en
 * 'Peripheral disconnected during service discovery'.
 *
 * Gebruik: node tools/test-reconnect.cjs
 */

'use strict';

const assert = require('node:assert');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function load(request, ...rest) {
  if (request === 'homey') {
    return { App: class {}, Device: class {}, Driver: class {} };
  }

  return originalLoad.call(this, request, ...rest);
};

const PlejdApp = require('../app');

Module._load = originalLoad;

function createApp() {
  const timers = [];

  const app = {
    devicesList: [],
    isDisconnecting: false,
    isConnecting: false,
    isConnected: false,
    isReconnectPending: false,
    doReconnectDelay: false,
    reconnectTimeoutIndex: null,
    pingErrorCount: 0,
    peripheral: null,
    connectCalls: 0,

    log: () => {},
    error: () => {},
    stopPollingState: () => {},
    setAllDevicesAsUnavailable: async () => {},

    async connect() {
      this.connectCalls++;
    },

    homey: {
      setTimeout(callback) {
        const timer = { callback, cancelled: false };
        timers.push(timer);
        return timer;
      },
      clearTimeout(timer) {
        if (timer) {
          timer.cancelled = true;
        }
      },
      clearInterval: () => {},
    },
  };

  app.reconnect = PlejdApp.prototype.reconnect;
  app.disconnect = PlejdApp.prototype.disconnect;

  const runTimers = async () => {
    const due = timers.splice(0).filter((timer) => !timer.cancelled);
    await Promise.all(due.map((timer) => timer.callback()));
    return due.length;
  };

  return { app, runTimers };
}

async function flush() {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
}

const cases = [
  {
    what: 'twee foutpaden melden dezelfde storing in dezelfde tick',
    async run() {
      const { app, runTimers } = createApp();

      app.reconnect();
      app.reconnect();
      await flush();

      const fired = await runTimers();

      assert.strictEqual(fired, 1, `${fired} reconnect-timers afgegaan, verwacht 1`);
      assert.strictEqual(app.connectCalls, 1, `${app.connectCalls} connect()-pogingen, verwacht 1`);
    },
  },
  {
    what: 'na een afgeronde poging kan een nieuwe storing opnieuw reconnecten',
    async run() {
      const { app, runTimers } = createApp();

      app.reconnect();
      await flush();
      await runTimers();

      app.reconnect();
      await flush();
      const fired = await runTimers();

      assert.strictEqual(fired, 1, 'tweede storing kreeg geen nieuwe reconnect');
      assert.strictEqual(app.connectCalls, 2, `${app.connectCalls} connect()-pogingen, verwacht 2`);
    },
  },
];

const main = async () => {
  let failures = 0;

  for (const testCase of cases) {
    try {
      await testCase.run();
      console.log(`ok    ${testCase.what}`);
    } catch (err) {
      failures++;
      console.log(`FOUT  ${testCase.what}`);
      console.log(`        ${err.message}`);
    }
  }

  if (failures > 0) {
    console.log(`\n${failures} van de ${cases.length} gefaald.`);
    process.exit(1);
  }

  console.log(`\nAlle ${cases.length} geslaagd.`);
};

main();
