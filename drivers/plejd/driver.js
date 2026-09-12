'use strict';

const Homey = require('homey');

const provisioning = require('../../lib/provisioning');

class PlejdDriver extends Homey.Driver {
  async onInit() {
    this.log('Plejd driver has been inited');

    this.homey.flow
      .getActionCard('dim_over_time')
      .registerRunListener(async (args) => {
        const seconds = Math.max(1, Math.min(600, Number(args.seconds) || 1));
        const normalizedBrightnessFrom = Math.max(
          0,
          Math.min(1, Number(args.brightness_from) || 0),
        );
        const normalizedBrightnessTo = Math.max(
          0,
          Math.min(1, Number(args.brightness_to) || 0),
        );
        const initialBrightness = Math.round(normalizedBrightnessFrom * 255);
        const targetBrightness = Math.round(normalizedBrightnessTo * 255);

        await this.homey.app.dimTo(
          args.device.getData().plejdId,
          targetBrightness,
          seconds,
          initialBrightness,
        );

        await args.device.setCapabilityValue('onoff', targetBrightness > 0);

        return Promise.resolve(true);
      });
  }

  onPair(session) {
    session.setHandler('list_devices', async () => provisioning.listDevices(this.homey, 'plejd'));
  }
}

module.exports = PlejdDriver;
