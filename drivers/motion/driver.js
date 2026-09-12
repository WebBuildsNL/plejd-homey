'use strict';

const Homey = require('homey');

const provisioning = require('../../lib/provisioning');

class PlejdMotionDriver extends Homey.Driver {
  async onInit() {
    this.log('Plejd motion driver has been inited');
  }

  onPair(session) {
    session.setHandler('list_devices', async () => provisioning.listDevices(this.homey, 'motion'));
  }
}

module.exports = PlejdMotionDriver;
