'use strict';

const Homey = require('homey');

const provisioning = require('../../lib/provisioning');

class PlejdButtonDriver extends Homey.Driver {
  async onInit() {
    this.log('Plejd button driver has been inited');
  }

  onPair(session) {
    session.setHandler('list_devices', async () => provisioning.listDevices(this.homey, 'button'));
  }
}

module.exports = PlejdButtonDriver;
