'use strict';

const Homey = require('homey');

const provisioning = require('../../lib/provisioning');

class PlejdCoverDriver extends Homey.Driver {
  async onInit() {
    this.log('Plejd cover driver has been inited');
  }

  onPair(session) {
    session.setHandler('list_devices', async () => provisioning.listDevices(this.homey, 'cover'));
  }
}

module.exports = PlejdCoverDriver;
