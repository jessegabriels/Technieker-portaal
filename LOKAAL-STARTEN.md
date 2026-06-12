# Lokaal starten & deployen — handleiding

## Inhoudsopgave

1. [Vereisten](#1-vereisten)
2. [Afhankelijkheden installeren](#2-afhankelijkheden-installeren)
3. [Odoo API-sleutel instellen](#3-odoo-api-sleutel-instellen)
4. [Alle omgevingsvariabelen — volledig overzicht](#4-alle-omgevingsvariabelen--volledig-overzicht)
5. [Variabelen lokaal wijzigen](#5-variabelen-lokaal-wijzigen)
6. [Lokaal starten](#6-lokaal-starten)
7. [Odoo-verbinding testen](#7-odoo-verbinding-testen)
8. [Variabelen instellen in Netlify via CLI](#8-variabelen-instellen-in-netlify-via-cli)
9. [Deployen naar productie via CLI](#9-deployen-naar-productie-via-cli)

---

## 1. Vereisten

- **Node.js 18 of hoger** → https://nodejs.org
- **Netlify CLI** (voor deployen): `npm install -g netlify-cli`
- Toegang tot je **Odoo 19** omgeving
- Een **Supabase**-project (database)

---

## 2. Afhankelijkheden installeren

Open een terminal in de projectmap en voer uit:

```bash
npm install
```

---

## 3. Odoo API-sleutel instellen

Voer het setup-script uit. Dit vraagt je Odoo-gegevens en schrijft `.env.local` aan:

```bash
npm run setup-odoo
```

Het script vraagt:
- Odoo URL (bijv. `https://jouwbedrijf.odoo.com`)
- Database naam
- Gebruikersnaam (e-mailadres)
- Wachtwoord (wordt **niet** opgeslagen)

### API-sleutel manueel kopiëren uit Odoo

Odoo geeft de ruwe API-sleutel enkel via de interface terug.

1. Ga in Odoo naar **Instellingen → Gebruikers & Bedrijven → Gebruikers**
2. Open de gebruiker waarmee de app verbinding maakt
3. Klik op het tabblad **"API-sleutels"**
4. Klik **"Sleutel aanmaken"** → geef als naam `bestelportaal-<datum>`
5. **Kopieer de sleutel** (je ziet hem maar één keer!)
6. Open `.env.local` en vervang de placeholder door de gekopieerde sleutel

### Odoo locatie-ID's en picking-type ID vinden

Open Odoo met debug-modus: voeg `?debug=1` toe aan de URL.

**Picking type ID:**
- Ga naar Voorraadbeheer → Configuratie → Bewerkingstypes
- Open het gewenste type (bijv. "Interne overboekingen")
- Kijk in de URL: `?id=7` → ID is `7`

**Locatie ID's:**
- Ga naar Voorraadbeheer → Configuratie → Locaties
- Open de bronlocatie (bijv. "WH/Stock") → noteer het ID in de URL
- Open de bestemmingslocatie (bijv. picklocatie of techniekerbus) → noteer het ID
- Open de **magazijnlocatie** (bijv. "WH") → noteer het ID voor `ODOO_WAREHOUSE_LOCATION_ID`

---

## 4. Alle omgevingsvariabelen — volledig overzicht

Hieronder een compleet overzicht van elke variabele, waarvoor die dient en hoe je de waarde vindt.

### Odoo-verbinding

| Variabele | Omschrijving | Voorbeeld |
|---|---|---|
| `ODOO_URL` | Volledig adres van je Odoo-instantie | `https://jouwbedrijf.odoo.com` |
| `ODOO_DB` | Naam van de Odoo-database | `jouwbedrijf` |
| `ODOO_USERNAME` | E-mailadres van de API-gebruiker in Odoo | `api@jouwbedrijf.be` |
| `ODOO_API_KEY` | API-sleutel van de Odoo-gebruiker | `330c0f26d1...` |

> **Let op:** gebruik een dedicated Odoo-gebruiker (niet je eigen account) met minimale rechten: lees/schrijf op `stock.picking`, `stock.move`, `product.product`, `stock.quant`.

### Beveiliging

| Variabele | Omschrijving | Hoe aanmaken |
|---|---|---|
| `JWT_SECRET` | Geheime sleutel voor JWT-tokens (min. 32 tekens) | `openssl rand -base64 48` in terminal |

> Verander dit altijd vóór productie. Gebruik nooit de standaardwaarde.

### Odoo locaties en picking

| Variabele | Omschrijving | Standaard | Hoe vinden |
|---|---|---|---|
| `ODOO_PICKING_TYPE_ID` | ID van het bewerkingstype in Odoo | `7` | Odoo → Voorraadbeheer → Bewerkingstypes → URL |
| `ODOO_SOURCE_LOCATION_ID` | Bronlocatie van elke picking (magazijn) | `17` | Odoo → Voorraadbeheer → Locaties → URL |
| `ODOO_DEST_LOCATION_ID` | Bestemmingslocatie (bus/technieker) | `13` | Odoo → Voorraadbeheer → Locaties → URL |
| `ODOO_WAREHOUSE_LOCATION_ID` | Bovenliggende magazijnlocatie voor stockoverzicht | `5` | Odoo → Voorraadbeheer → Locaties → moederlocatie "WH" → URL |

> `ODOO_WAREHOUSE_LOCATION_ID` bepaalt welke locatie (en alle sub-locaties) getoond worden op de pagina "Magazijn stock". Gebruik de ID van de bovenliggende "WH"-locatie, niet van een sub-locatie.

### Supabase (database)

| Variabele | Omschrijving | Waar vinden |
|---|---|---|
| `SUPABASE_URL` | URL van je Supabase-project | Supabase dashboard → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | Service role key (volledige toegang, **geheim houden**) | Supabase dashboard → Project Settings → API → `service_role` key |

> Gebruik **altijd** de `service_role` key voor de backend, niet de `anon` key. De service role key mag nooit in de browser terechtkomen.

### Frontend (optioneel)

| Variabele | Omschrijving | Standaard |
|---|---|---|
| `REACT_APP_API_BASE` | API-basisadres voor lokale dev | `http://localhost:3001` |
| `REACT_APP_COMPANY_NAME` | Naam bovenaan de sidebar | `Bestelportaal` |
| `REACT_APP_COMPANY_SUBTITLE` | Ondertitel in de sidebar | `Technieker` |

> `REACT_APP_`-variabelen worden ingebakken in de React-build. Stel ze ook in bij Netlify als je de naam van het bedrijf wil aanpassen zonder code te wijzigen.

---

## 5. Variabelen lokaal wijzigen

Alle lokale instellingen staan in `.env.local` (dit bestand staat in `.gitignore` en wordt nooit naar git gepusht).

```bash
# Bestand openen in VS Code
code .env.local

# Of in Notepad
notepad .env.local
```

**Formaat:**
```
VARIABELE_NAAM=waarde
```

Geen aanhalingstekens nodig tenzij de waarde spaties bevat. Na een wijziging moet je `npm run dev` herstarten — de server laadt `.env.local` enkel bij opstart.

**Voorbeeld volledig `.env.local`:**
```
ODOO_URL=https://jouwbedrijf.odoo.com
ODOO_DB=jouwbedrijf
ODOO_USERNAME=api@jouwbedrijf.be
ODOO_API_KEY=330c0f26d1d5dcc0861c2ac02d832722144d6611

JWT_SECRET=eenHeelLangeWillekeurigeStringVanMinimaal32Tekens

ODOO_PICKING_TYPE_ID=7
ODOO_SOURCE_LOCATION_ID=17
ODOO_DEST_LOCATION_ID=13
ODOO_WAREHOUSE_LOCATION_ID=5

SUPABASE_URL=https://xyzxyzxyz.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIs...

REACT_APP_API_BASE=http://localhost:3001
REACT_APP_COMPANY_NAME=Telcom
REACT_APP_COMPANY_SUBTITLE=Bestelportaal
```

---

## 6. Lokaal starten

```bash
npm run dev
```

Dit start **twee processen tegelijk**:
- API-server op `http://localhost:3001`
- React frontend op `http://localhost:3000`

Open je browser op **http://localhost:3000**.

**Standaard inloggegevens (wijzig vóór productie!):**
| Gebruikersnaam | Wachtwoord | Rol | Afdeling |
|---|---|---|---|
| `admin` | `Admin@2024!` | Beheerder | Alle |
| `jan.de.smedt` | `Tech@2024!` | Technieker | Laadpalen |
| `peter.wouters` | `Tech@2024!` | Technieker | Zonnepanelen |

> Wachtwoorden wijzigen via het beheerpaneel → Gebruikers.

---

## 7. Odoo-verbinding testen

Na het inloggen als admin:
1. Ga naar **Bestellen**
2. Voeg een artikel toe aan de winkelwagen en plaats een bestelling
3. Als het goed werkt zie je een Odoo picking-nummer (bijv. `WH/INT/00001`)
4. Controleer in Odoo → Voorraadbeheer → Transfers

Als je een fout ziet, controleer:
- Klopt de API-sleutel in `.env.local`?
- Heeft de Odoo-gebruiker de juiste rechten?
- Kloppen de locatie-ID's en het picking-type ID?
- Is de Supabase-verbinding correct? (controleer `SUPABASE_URL` en `SUPABASE_SERVICE_KEY`)

---

## 8. Variabelen instellen in Netlify via CLI

### 8.1 Netlify CLI installeren en inloggen

```bash
# CLI installeren (eenmalig, globaal)
npm install -g netlify-cli

# Inloggen op Netlify (opent browser)
netlify login
```

### 8.2 Site koppelen aan je Netlify-project

Doe dit eenmalig in je projectmap:

```bash
# Koppel aan een bestaande Netlify-site
netlify link

# Of maak een nieuwe site aan en koppel meteen
netlify init
```

Na `netlify link` kies je je site uit de lijst. De koppeling wordt opgeslagen in `.netlify/state.json`.

### 8.3 Variabelen één voor één instellen

```bash
netlify env:set ODOO_URL "https://jouwbedrijf.odoo.com"
netlify env:set ODOO_DB "jouwbedrijf"
netlify env:set ODOO_USERNAME "api@jouwbedrijf.be"
netlify env:set ODOO_API_KEY "jouw_api_sleutel_hier"

netlify env:set JWT_SECRET "jouwHeelLangeGeheimeSleutel"

netlify env:set ODOO_PICKING_TYPE_ID "7"
netlify env:set ODOO_SOURCE_LOCATION_ID "17"
netlify env:set ODOO_DEST_LOCATION_ID "13"
netlify env:set ODOO_WAREHOUSE_LOCATION_ID "5"

netlify env:set SUPABASE_URL "https://xyzxyzxyz.supabase.co"
netlify env:set SUPABASE_SERVICE_KEY "eyJhbGciOiJIUzI1NiIs..."

netlify env:set REACT_APP_COMPANY_NAME "Telcom"
netlify env:set REACT_APP_COMPANY_SUBTITLE "Bestelportaal"
```

> Gebruik aanhalingstekens rondom de waarde als ze speciale tekens bevat.

### 8.4 Alle variabelen in één keer importeren vanuit `.env.local`

Dit is de snelste manier als je `.env.local` al volledig ingevuld is:

```bash
netlify env:import .env.local
```

Netlify leest dan het `.env.local`-bestand en importeert alle variabelen automatisch. Bestaande variabelen worden overschreven.

> **Let op:** `REACT_APP_API_BASE=http://localhost:3001` staat mogelijk in `.env.local` voor lokale ontwikkeling. Verwijder of overschrijf deze na de import, want op productie mag die variabele niet aanwezig zijn (de frontend gebruikt dan automatisch `/.netlify/functions`):
> ```bash
> netlify env:unset REACT_APP_API_BASE
> ```

### 8.5 Variabelen controleren

```bash
# Lijst alle variabelen op (waarden verborgen)
netlify env:list

# Toon de waarde van één specifieke variabele
netlify env:get ODOO_URL
```

### 8.6 Een variabele aanpassen

Gewoon opnieuw `env:set` uitvoeren — de bestaande waarde wordt overschreven:

```bash
netlify env:set ODOO_WAREHOUSE_LOCATION_ID "8"
```

### 8.7 Een variabele verwijderen

```bash
netlify env:unset VARIABELE_NAAM
```

### 8.8 Variabelen per context instellen (optioneel)

Netlify ondersteunt verschillende contexten: `production`, `deploy-preview` en `branch-deploy`. Standaard gelden ingestelde variabelen voor alle contexten.

```bash
# Enkel voor productie
netlify env:set ODOO_URL "https://productie.odoo.com" --context production

# Enkel voor preview-deploys (bijv. pull requests)
netlify env:set ODOO_URL "https://test.odoo.com" --context deploy-preview
```

---

## 9. Deployen naar productie via CLI

### 9.1 Eerste keer: bouwen en deployen

```bash
# Zorg eerst dat de site gekoppeld is (zie stap 8.2)
netlify link

# Bouw de React-app en deploy naar productie
netlify deploy --prod
```

Netlify voert automatisch `npm run build` uit (ingesteld in `netlify.toml`) en deployt de `build/`-map samen met de functions.

### 9.2 Preview deploy (testen vóór productie)

Maak een tijdelijke preview-URL zonder de productiesite te overschrijven:

```bash
netlify deploy
```

Je krijgt een tijdelijke URL zoals `https://abc123--jouwsite.netlify.app`. Zodra je tevreden bent:

```bash
netlify deploy --prod
```

### 9.3 Status en logs bekijken

```bash
# Overzicht van de site en recente deploys
netlify status

# Open het Netlify-dashboard in de browser
netlify open

# Live logs van de serverless functions bekijken
netlify functions:log
```

### 9.4 Automatisch deployen via GitHub (aanbevolen)

Koppel je GitHub-repo eenmalig aan Netlify:

```bash
netlify init
```

Na de koppeling deployt Netlify automatisch bij elke `git push` naar de hoofdbranch. Je hoeft dan nooit meer manueel `netlify deploy` uit te voeren.

```bash
# Wijzigingen pushen → automatische deploy getriggerd
git add .
git commit -m "Beschrijving van de wijziging"
git push origin main
```

---

## Samenvatting — meest gebruikte commando's

| Situatie | Commando |
|---|---|
| Lokaal starten | `npm run dev` |
| Variabele instellen in Netlify | `netlify env:set NAAM "waarde"` |
| Alle variabelen importeren | `netlify env:import .env.local` |
| Variabelen oplijsten | `netlify env:list` |
| Variabele verwijderen | `netlify env:unset NAAM` |
| Preview deploy | `netlify deploy` |
| Productie deploy | `netlify deploy --prod` |
| Site openen in browser | `netlify open` |
| Logs bekijken | `netlify functions:log` |
