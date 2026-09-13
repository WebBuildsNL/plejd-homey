# Plejd (lokaal) voor Homey

Plejd-verlichting aansturen vanaf Homey via bluetooth. Geen GWY-01 gateway
nodig, en geen Plejd-wachtwoord op je Homey.

Fork van [emilohman/homey-plejd](https://github.com/emilohman/homey-plejd)
v3.5.4. De BLE-logica komt daarvandaan en is ongewijzigd. Wat hier anders is, is
hoe de app aan je installatiegegevens komt en hoe hij bepaalt wat een apparaat
kan.

## Het probleem dat dit oplost

De originele app adverteert dat hij zonder gateway werkt, en dat klopt: hij praat
rechtstreeks met het Plejd-mesh over bluetooth. Toch vraagt hij bij het koppelen
om je Plejd-gebruikersnaam en wachtwoord, en die bewaart hij daarna permanent in
`homey.settings`.

Dat is geen slordigheid. Elk commando naar het mesh is een AES-128 versleuteld
BLE-pakket, en die versleuteling gebruikt de **cryptoKey** van jouw site.
Daarnaast heeft de app per apparaat het **mesh-adres** nodig — een enkele byte
die niets met het BLE MAC-adres te maken heeft. Geen van beide is uit het mesh
zelf uit te lezen: ze worden aangemaakt door de Plejd-app en bestaan alleen in
de Plejd-cloud.

Deze fork haalt die gegevens één keer op met een script op je eigen computer, en
geeft de Homey alleen het resultaat. Aansturen was al lokaal; nu is het
inrichten dat ook.

## Verschillen met de originele app

| | origineel | deze fork |
| --- | --- | --- |
| Koppelen | inloggen met je Plejd-account | site-JSON plakken in de instellingen |
| Wachtwoord op Homey | ja, in `homey.settings` | nee |
| Scenes ophalen | cloud-call bij elk gebruik van de flowcard | uit de opgeslagen site-JSON |
| Apparaattype bepalen | hardcoded `hardwareId`-tabel | `traits` + `outputType` uit de site-data |
| Modelnaam | uit diezelfde tabel | uit `firmware.notes`, dus wat het apparaat zelf meldt |
| Foutrapportage | Sentry (extern) | alleen de Homey-log |
| Dependencies | axios, homey-log, tinycolor2 | geen |

## Hoe apparaatdetectie werkt

De originele app leidt uit een `hardwareId` af of iets een lamp is en of hij
dimbaar is. Nieuwe Plejd-modellen die niet in die lijst staan vallen terug op
`-unknown-`.

Dat is niet nodig, want de site-data zegt het zelf. Elk apparaat heeft een
`traits`-bitmask:

| bit | naam | betekenis |
| --- | --- | --- |
| `0x01` | POWER | kan aan/uit |
| `0x02` | DIM | dimbaar |
| `0x04` | TEMP | instelbare kleurtemperatuur |
| `0x08` | GROUP | groepeerbaar |
| `0x10` | COVER | rolluik/zonwering |
| `0x20` | CLIMATE | klimaatregeling |
| `0x40` | TILT | kantelbare lamellen |
| `0x80` | CLIMATE_PWM | klimaatregeling via PWM |

Plus een `outputType` (`LIGHT`, `RELAY`, `COVERABLE`) en een modelnaam in
`firmware.notes`. `lib/site.js` gebruikt die drie, met de `hardwareId`-tabel nog
slechts als laatste redmiddel voor de weergavenaam.

Concreet: een Plejd VRI-03 draaidimmer meldt zich als `DIM-01-LC2`,
`hardwareId 22`, `outputType LIGHT`, `traits 11` (`POWER | DIM | GROUP`).
Daaruit volgt alles wat Homey moet weten, zonder dat het model ergens in code
hoeft te staan. Modellen die na deze commit uitkomen werken daardoor vanzelf.

## Installeren

Vereist [Node.js](https://nodejs.org) en de
[Homey CLI](https://apps.developer.homey.app/the-basics/getting-started).

```bash
git clone git@github.com:WebBuildsNL/plejd-homey.git
cd plejd-homey

# 1. Site-gegevens ophalen (eenmalig, draait op je eigen computer)
node tools/plejd-dump.mjs

# 2. App op je Homey zetten
homey login
homey select
homey app install
```

Stap 1 vraagt om je Plejd-inloggegevens, logt in bij de Plejd-cloud en schrijft
`plejd-site.json` weg. Dat bestand staat in `.gitignore` — het bevat je
cryptoKey, waarmee iedereen binnen bluetooth-bereik je verlichting kan bedienen.

Daarna in de Homey-app: **Instellingen → Apps → Plejd (lokaal) → Instellingen**,
de inhoud van `plejd-site.json` plakken en opslaan. Je krijgt direct een tabel
met wat er gevonden is. Apparaten toevoegen via **Apparaten → + → Plejd
(lokaal) → Plejd**.

Draai je de originele Plejd-app ook? Zet die dan uit. Twee apps die vanaf
dezelfde Homey een BLE-verbinding naar hetzelfde mesh opzetten zitten elkaar in
de weg.

## Site-gegevens verversen

Apparaat toegevoegd of hernoemd in de Plejd-app? Draai `tools/plejd-dump.mjs`
opnieuw en plak de nieuwe JSON. Bestaande Homey-apparaten blijven werken zolang
hun mesh-adres niet verandert.

## Ontwikkelen

```bash
node tools/test-mesh-matching.cjs       # herkenning van het mesh in BLE-advertenties
node tools/test-notifications.cjs       # BLE-meldingen coderen en terugparsen
node tools/test-provisioning.cjs        # provisioning + pairing tegen echte site-data
homey app validate --level debug        # manifest en assets
npx eslint .                            # stijl
homey app run                           # draaien met live logs
```

`tools/test-provisioning.cjs` draait de echte `lib/provisioning.js` en `api.js`
tegen een nagebootste `homey.settings`, zodat je zonder Homey kunt controleren
of ongeldige invoer netjes geweigerd wordt en geldige invoer de juiste
apparatenlijst oplevert. Geef eventueel een pad mee als `plejd-site.json`
ergens anders staat.

De `tools/`-map zit in `.homeyignore` en wordt dus niet meegebundeld naar je
Homey.

## Bekende beperkingen

**Knoppen op een dimmer worden niet als los apparaat getoond.** `app.js` houdt
één Homey-apparaat per mesh-adres bij (`this.devices[plejdId]`), en bij een
dimmer met een draaiknop delen de lamp en de knoppen hetzelfde adres. Losse
knop-apparaten vragen dus eerst een andere administratie in `registerDevice()`.
Bovendien is nog niet gemeten of zo'n ingebouwde knop überhaupt een
`REMOTE_CLICK` het mesh in stuurt. Losse wandknoppen zoals de WPH-01 en WRT-01
werken wel.

**Scenes vereisen dat je ze in de Plejd-app aanmaakt** en daarna de site-JSON
opnieuw ophaalt.

**Alleen getest met een VRI-03 / DIM-01-LC2.** De code voor rolluiken,
thermostaten en bewegingssensoren komt ongewijzigd uit de originele app en is
hier niet opnieuw geverifieerd.

## Dank

Aan [Emil Öhman](https://github.com/emilohman) voor de Homey-app waar dit op
gebouwd is, aan [@klali](https://github.com/klali) voor het reverse-engineeren
van het Plejd BLE-protocol, en aan
[thomasloven/pyplejd](https://github.com/thomasloven/pyplejd) voor het inzicht
dat `traits` en `outputType` een hardcoded modellijst overbodig maken.

## Licentie

MIT.
