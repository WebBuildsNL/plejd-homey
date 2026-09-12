'use strict';

const provisioning = require('./lib/provisioning');

module.exports = {
  /** Wat er nu bekend is, om in de instellingen te tonen. */
  async getSummary({ homey }) {
    return {
      configured: provisioning.hasSiteData(homey),
      summary: provisioning.getSummary(homey),
    };
  },

  /** Slaat een geplakte site-JSON op. Gooit een leesbare fout als die niet klopt. */
  async saveSite({ homey, body }) {
    const summary = provisioning.saveSiteData(homey, body && body.site);

    homey.app.log(
      `Site opgeslagen: ${summary.title}, ${summary.deviceCount} apparaat/apparaten`,
    );

    return { configured: true, summary };
  },

  async clearSite({ homey }) {
    provisioning.clearSiteData(homey);
    homey.app.log('Site-gegevens gewist');

    return { configured: false, summary: null };
  },
};
