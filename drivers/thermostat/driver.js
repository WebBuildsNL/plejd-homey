'use strict';

const Homey = require('homey');

const provisioning = require('../../lib/provisioning');

class PlejdThermostatDriver extends Homey.Driver {
  async onInit() {
    this.log('Plejd thermostat driver has been inited');
  }

  onPair(session) {
    session.setHandler('list_devices', async () => provisioning.listDevices(this.homey, 'thermostat'));
  }
}

module.exports = PlejdThermostatDriver;
