'use strict';

/**
 * Pure parser voor de Plejd site-definitie.
 *
 * Deze module praat NIET met de Plejd cloud. Hij krijgt de site-JSON die je
 * eenmalig lokaal hebt opgehaald (tools/plejd-dump.mjs) en leidt daar alles uit
 * af wat de Homey-app nodig heeft: de cryptoKey, de mesh-adressen en per
 * apparaat de capabilities.
 *
 * Capabilities komen uit de `traits`-bitmask en `outputType` van de site-data
 * zelf, niet uit een hardcoded hardwareId-tabel. Daardoor werken ook Plejd
 * modellen die nog niet bestonden toen deze code geschreven werd.
 */

const TRAITS = {
  POWER: 0x01,
  DIM: 0x02,
  TEMP: 0x04,
  GROUP: 0x08,
  COVER: 0x10,
  CLIMATE: 0x20,
  TILT: 0x40,
  CLIMATE_PWM: 0x80,
};

/**
 * Alleen gebruikt als de firmware geen modelnaam meldt. Puur cosmetisch:
 * capabilities komen uit traits, niet hieruit.
 */
const HARDWARE_NAMES = {
  1: 'DIM-01',
  2: 'DIM-02',
  3: 'CTR-01',
  4: 'GWY-01',
  5: 'LED-10',
  6: 'WPH-01',
  7: 'REL-01',
  8: 'SPR-01',
  10: 'WRT-01',
  11: 'DIM-01-2P',
  12: 'DAL-01',
  13: 'Generic',
  14: 'DIM-01-LC',
  15: 'DIM-02-LC',
  16: 'JAL-01',
  17: 'REL-01-2P',
  18: 'REL-02',
  19: 'EXT-01',
  20: 'SPR-01',
  22: 'DIM-01-LC2',
  36: 'LED-75',
  38: 'WPH-01-LC',
  40: 'SPD-01',
  70: 'WMS-01',
  103: 'OUT-01',
  135: 'OUT-02',
  167: 'DWN-01',
  199: 'DWN-02',
};

/** hardwareIds die een knop/afstandsbediening zijn in plaats van een lamp. */
const BUTTON_HARDWARE_IDS = new Set([6, 10, 38]);
/** hardwareIds van bewegingssensoren. */
const MOTION_HARDWARE_IDS = new Set([70]);

function hasTrait(traits, bit) {
  const value = Number(traits);
  return !Number.isNaN(value) && (value & bit) === bit;
}

/**
 * Accepteert zowel de ruwe cloud-response ({ result: [ site ] }) als het
 * site-object zelf, zodat het niet uitmaakt wat je precies plakt.
 */
function normalizeSite(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;

  if (!data || typeof data !== 'object') {
    throw new Error('Geen geldige JSON.');
  }

  const site = Array.isArray(data.result) ? data.result[0] : data;

  if (!site || typeof site !== 'object') {
    throw new Error('Geen site gevonden in de JSON.');
  }

  if (!site.plejdMesh || !site.plejdMesh.cryptoKey) {
    throw new Error(
      'Geen cryptoKey gevonden. Plak de volledige inhoud van plejd-site.json.',
    );
  }

  if (!Array.isArray(site.devices)) {
    throw new Error('Geen apparatenlijst gevonden in de JSON.');
  }

  return site;
}

function getCryptoKey(site) {
  return site.plejdMesh.cryptoKey;
}

function getSiteTitle(site) {
  return (site.site && site.site.title) || 'Plejd';
}

/** Modelnaam zoals de firmware zichzelf noemt, bijv. "DIM-01-LC2". */
function getHardwareName(plejdDevice) {
  const notes = plejdDevice && plejdDevice.firmware && plejdDevice.firmware.notes;

  if (typeof notes === 'string' && notes.trim()) {
    return notes.trim().split(/\s+/)[0];
  }

  const hardwareId = Number(plejdDevice && plejdDevice.hardwareId);

  return HARDWARE_NAMES[hardwareId] || '-unknown-';
}

/**
 * Homey device class. Eerst wat de site-data zelf zegt (outputType), daarna
 * afgeleid uit traits, en pas als laatste redmiddel uit het hardwareId.
 */
function getDeviceClass(device, plejdDevice, settings, inputs) {
  const hardwareId = Number(plejdDevice && plejdDevice.hardwareId);
  const { traits } = device;

  if (inputs.some((input) => input.motionSensorData)) {
    return 'motion';
  }

  if (MOTION_HARDWARE_IDS.has(hardwareId)) {
    return 'motion';
  }

  if (
    (settings && settings.climateSettings)
    || hasTrait(traits, TRAITS.CLIMATE)
    || hasTrait(traits, TRAITS.CLIMATE_PWM)
  ) {
    return 'thermostat';
  }

  if (hasTrait(traits, TRAITS.COVER)) {
    return 'cover';
  }

  switch (device.outputType) {
    case 'LIGHT':
      return 'light';
    case 'RELAY':
      return 'socket';
    case 'COVERABLE':
      return 'cover';
    default:
      break;
  }

  if (BUTTON_HARDWARE_IDS.has(hardwareId)) {
    return 'button';
  }

  if (hasTrait(traits, TRAITS.POWER)) {
    return hasTrait(traits, TRAITS.DIM) ? 'light' : 'socket';
  }

  return 'light';
}

function isDimmable(device, deviceClass) {
  if (deviceClass !== 'light') {
    return false;
  }

  return hasTrait(device.traits, TRAITS.DIM);
}

function supportsColorTemperature(device, settings) {
  if (hasTrait(device.traits, TRAITS.TEMP)) {
    return true;
  }

  return Boolean(settings && settings.colorTemperature);
}

/** Mesh-adres waar dit apparaat op luistert. */
function getMeshAddress(site, device, settings) {
  const { deviceId } = device;

  if (settings && settings.output !== null && settings.output !== undefined) {
    const outputs = site.outputAddress && site.outputAddress[deviceId];

    if (outputs && outputs[settings.output] !== undefined) {
      return outputs[settings.output];
    }
  }

  return site.deviceAddress && site.deviceAddress[deviceId];
}

/**
 * @param {object} site genormaliseerde site
 * @param {string} [filterType] undefined = lampen + stopcontacten (zoals de
 *   hoofd-driver verwacht), anders 'button' | 'motion' | 'cover' | 'thermostat'
 */
function getDevices(site, filterType) {
  const rooms = {};

  for (const room of site.rooms || []) {
    rooms[room.roomId] = room.title;
  }

  const devices = [];

  for (const device of site.devices) {
    if (device.hiddenFromIntegrations) {
      continue;
    }

    const plejdDevice = (site.plejdDevices || []).find(
      (x) => x.deviceId === device.deviceId,
    );

    if (!plejdDevice) {
      continue;
    }

    const settings = (site.outputSettings || []).find(
      (x) => x.deviceParseId === device.objectId,
    );
    const inputs = (site.inputSettings || []).filter(
      (x) => x.deviceId === device.deviceId,
    );

    const address = getMeshAddress(site, device, settings);

    if (address === undefined || address === null) {
      continue;
    }

    const deviceClass = getDeviceClass(device, plejdDevice, settings, inputs);

    let { title } = device;

    if (device.roomId && rooms[device.roomId]) {
      title = `${rooms[device.roomId]} ${device.title}`;
    }

    const newDevice = {
      id: address,
      deviceId: device.deviceId,
      name: title,
      type: deviceClass,
      hardwareName: getHardwareName(plejdDevice),
      hardwareId: plejdDevice.hardwareId,
      traits: device.traits,
      dimmable: isDimmable(device, deviceClass),
      colorTemp: supportsColorTemperature(device, settings),
    };

    const wanted = filterType === undefined
      ? deviceClass === 'light' || deviceClass === 'socket'
      : deviceClass === filterType;

    if (wanted) {
      devices.push(newDevice);
    }
  }

  return devices.sort((a, b) => a.name.localeCompare(b.name));
}

function getScenes(site) {
  const sceneIndex = site.sceneIndex || {};

  return (site.scenes || [])
    .filter((scene) => !scene.hiddenFromSceneList)
    .map((scene) => ({
      name: scene.title,
      id: sceneIndex[scene.sceneId],
    }))
    .filter((scene) => scene.id !== undefined);
}

/** Korte samenvatting voor de settings-pagina, zodat je ziet of het klopte. */
function summarize(site) {
  const all = [];

  for (const filter of [undefined, 'button', 'motion', 'cover', 'thermostat']) {
    all.push(...getDevices(site, filter));
  }

  return {
    title: getSiteTitle(site),
    deviceCount: all.length,
    sceneCount: getScenes(site).length,
    devices: all.map((d) => ({
      name: d.name,
      address: d.id,
      hardwareName: d.hardwareName,
      type: d.type,
      dimmable: d.dimmable,
      colorTemp: d.colorTemp,
    })),
  };
}

module.exports = {
  TRAITS,
  normalizeSite,
  getCryptoKey,
  getSiteTitle,
  getDevices,
  getScenes,
  summarize,
};
