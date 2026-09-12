'use strict';

/**
 * Alles wat de app nodig heeft om apparaten te koppelen, komt uit de site-JSON
 * die in de app-settings is geplakt. Er wordt nooit ingelogd bij Plejd.
 */

const site = require('./site');

const SETTING_SITE_DATA = 'siteData';
const SETTING_CRYPTO_KEY = 'cryptokey';

/** Welke apparaten een driver mag tonen. undefined = lampen + stopcontacten. */
const DRIVER_FILTERS = {
  plejd: undefined,
  button: 'button',
  cover: 'cover',
  motion: 'motion',
  thermostat: 'thermostat',
};

/** Hoe elke driver zijn Homey-device beschrijft. */
const DRIVER_SHAPES = {
  plejd(device) {
    const capabilities = ['onoff'];

    if (device.dimmable) {
      capabilities.push('dim');
    }

    if (device.colorTemp) {
      capabilities.push('light_temperature');
    }

    return {
      data: {
        id: device.deviceId,
        plejdId: device.id,
        dimmable: device.dimmable,
      },
      capabilities,
      class: device.type,
      settings: {
        device_class: device.type,
        dimmable: device.dimmable,
        color_temperature: device.colorTemp,
      },
    };
  },

  button(device) {
    return {
      data: {
        id: device.deviceId,
        plejdId: device.id,
      },
    };
  },

  cover(device) {
    return {
      data: {
        id: device.deviceId,
        plejdId: device.id,
      },
      capabilities: ['windowcoverings_set'],
      class: 'curtain',
    };
  },

  motion(device) {
    return {
      data: {
        id: device.deviceId,
        plejdId: device.id,
      },
      capabilities: ['alarm_motion'],
      class: 'sensor',
    };
  },

  thermostat(device) {
    return {
      data: {
        id: device.deviceId,
        plejdId: device.id,
      },
      capabilities: ['target_temperature', 'measure_temperature', 'onoff'],
      class: 'thermostat',
    };
  },
};

/**
 * Slaat een geplakte site-JSON op en zet meteen de cryptoKey klaar.
 * Gooit een leesbare fout als de JSON niet klopt.
 *
 * @returns {object} samenvatting om in de settings-pagina te tonen
 */
function saveSiteData(homey, raw) {
  const parsed = site.normalizeSite(raw);

  homey.settings.set(SETTING_SITE_DATA, parsed);
  homey.settings.set(SETTING_CRYPTO_KEY, site.getCryptoKey(parsed));

  return site.summarize(parsed);
}

function hasSiteData(homey) {
  return Boolean(homey.settings.get(SETTING_SITE_DATA));
}

function getSite(homey) {
  const stored = homey.settings.get(SETTING_SITE_DATA);

  if (!stored) {
    throw new Error(
      'Nog geen Plejd-gegevens. Ga naar de app-instellingen en plak daar de inhoud van plejd-site.json.',
    );
  }

  return site.normalizeSite(stored);
}

function getSummary(homey) {
  if (!hasSiteData(homey)) {
    return null;
  }

  return site.summarize(getSite(homey));
}

function clearSiteData(homey) {
  homey.settings.unset(SETTING_SITE_DATA);
  homey.settings.unset(SETTING_CRYPTO_KEY);
}

/** Bouwt de apparatenlijst voor het koppelscherm van één driver. */
function listDevices(homey, driverId) {
  const parsed = getSite(homey);
  const shape = DRIVER_SHAPES[driverId];

  if (!shape) {
    throw new Error(`Onbekende driver: ${driverId}`);
  }

  return site.getDevices(parsed, DRIVER_FILTERS[driverId]).map((device) => ({
    name: device.name,
    store: {
      hardwareName: device.hardwareName,
      hardwareId: device.hardwareId,
      traits: device.traits,
    },
    ...shape(device),
  }));
}

function getScenes(homey) {
  return site.getScenes(getSite(homey));
}

module.exports = {
  SETTING_SITE_DATA,
  SETTING_CRYPTO_KEY,
  saveSiteData,
  hasSiteData,
  getSite,
  getSummary,
  clearSiteData,
  listDevices,
  getScenes,
};
