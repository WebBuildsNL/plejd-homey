# Plejd (lokaal)

Plejd op Homey via bluetooth. Geen GWY-01 gateway, en geen Plejd-wachtwoord op
je Homey.

Fork van [emilohman/homey-plejd](https://github.com/emilohman/homey-plejd)
v3.5.4. Alle BLE-logica komt daarvandaan; wat hier anders is, is hoe de app aan
je installatiegegevens komt.

## Wat er anders is dan de originele app

| | origineel | deze fork |
| --- | --- | --- |
| Koppelen | inloggen met je Plejd-account | site-JSON plakken in de instellingen |
| Wachtwoord op Homey | ja, in `homey.settings` | nee |
| Scenes ophalen | cloud-call bij elk gebruik | uit de opgeslagen site-JSON |
| Apparaat-type bepalen | hardcoded `hardwareId`-tabel | `traits` + `outputType` uit de site-data |
| Modelnaam | uit diezelfde tabel | uit `firmware.notes`, dus wat het apparaat zelf zegt |
| Foutrapportage | Sentry (extern) | alleen de Homey-log |

Die derde en vierde rij zijn de reden dat nieuwe Plejd-modellen hier vanzelf
werken. De VRI-03 bijvoorbeeld meldt zich als `DIM-01-LC2` met `traits 11`
(`POWER | DIM | GROUP`), en daar is alles uit af te leiden zonder dat het model
ergens in een lijst hoeft te staan.

## Waarom er überhaupt gegevens uit de cloud komen

Aansturen gaat volledig lokaal: elk commando is een AES-128 versleuteld BLE-pakket
naar het mesh. Maar die versleuteling gebruikt de **cryptoKey** van je site, en
daarnaast is per apparaat het **mesh-adres** nodig. Beide bestaan alleen in de
Plejd-cloud, omdat de Plejd-app ze daar aanmaakt bij het inrichten.

Deze fork haalt ze één keer op met een los script op je eigen computer, en de
Homey krijgt alleen het resultaat. Verandert er niets aan je installatie, dan
hoeft dat nooit meer.

## Installeren

```bash
# 1. Gegevens ophalen (op je computer, eenmalig)
node ../tools/plejd-dump.mjs

# 2. App op je Homey zetten
npm install
homey login
homey app install
```

Daarna in de Homey-app: **Instellingen → Apps → Plejd (lokaal) → Instellingen**,
de inhoud van `plejd-site.json` plakken en opslaan. Je ziet meteen welke
apparaten gevonden zijn. Toevoegen via **Apparaten → + → Plejd (lokaal)**.

`homey app install` zet de app er permanent op. Gebruik `homey app run` als je
aan de code werkt: dan draait hij zolang je terminal openstaat en zie je de logs
live.

## Als je je Plejd-installatie wijzigt

Apparaat toegevoegd of hernoemd in de Plejd-app? Draai `plejd-dump.mjs` opnieuw
en plak de nieuwe JSON. Bestaande Homey-apparaten blijven werken zolang hun
mesh-adres niet verandert.

## Wat nog niet werkt

De drukknoppen en de draaiknop van een dimmer worden niet als losse Homey-knop
blootgesteld. Dat kan niet zomaar: `app.js` houdt één apparaat per mesh-adres
bij, en bij een VRI-03 delen de lamp en de knoppen hetzelfde adres (11 in het
testvoorbeeld). Losse knop-apparaten vragen dus eerst een andere administratie
in `registerDevice()`. Losse knoppen zoals de WPH-01 en WRT-01 werken wel.

## Licentie

MIT, net als het origineel.
