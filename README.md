# Technieker Bestelportaal

Een webapplicatie voor techniekers om magazijnartikelen te bestellen, met automatische picking-aanmaak in Odoo 19 Enterprise.

---

## Architectuur

```
Browser (React op Netlify)
  ↓ HTTPS
Netlify Functions (serverless Node.js)
  ↓ XML-RPC
Odoo 19 Enterprise
```

---

## Functies

- **Login** per technieker met JWT-beveiliging
- **Artikelenlijst** gefilterd per afdeling (laadpalen / zonnepanelen / all)
- **Bestelflow** met winkelwagen + opmerking
- **Automatische picking** in Odoo bij elke bestelling
- **Bestelhistoriek** per technieker
- **Beheerpaneel**: gebruikers, artikelen, alle bestellingen
- **Excel-import** voor artikelen (met sjabloon)

---

## Installatie

### Vereisten
- Node.js 18+
- Netlify CLI: `npm install -g netlify-cli`
- Odoo 19 Enterprise met API-toegang

### 1. Afhankelijkheden installeren

```bash
npm install
```

### 2. Omgevingsvariabelen configureren

Kopieer `.env.example` naar `.env.local`:

```bash
cp .env.example .env.local
```

Vul in `.env.local`:

```
ODOO_URL=https://jouw-odoo.com
ODOO_DB=jouw_database
ODOO_USERNAME=api@jouwbedrijf.be
ODOO_API_KEY=jouw_api_sleutel

JWT_SECRET=minimaal_32_tekens_willekeurige_string

ODOO_PICKING_TYPE_ID=2      # Interne overboekingen
ODOO_SOURCE_LOCATION_ID=8   # Magazijn bronlocatie
ODOO_DEST_LOCATION_ID=5     # Bestemmingslocatie (bus/technieker)
```

#### Odoo locatie-ID's vinden

In Odoo: ga naar **Voorraadbeheer → Configuratie → Locaties**.
Activeer ontwikkelaarsmodus (instellingen → URL toevoegen `?debug=1`).
De ID staat in de URL wanneer je een locatie opent.

#### Odoo picking-type ID vinden

In Odoo: ga naar **Voorraadbeheer → Configuratie → Bewerkingstypes**.
Open het gewenste type (bijv. "Interne overboekingen") en kijk in de URL.

#### Odoo API-sleutel aanmaken

1. Log in als API-gebruiker in Odoo
2. Ga naar **Instellingen → Gebruikers → API Sleutels**
3. Maak een nieuwe sleutel aan
4. Geef de gebruiker rechten op `stock.picking`, `stock.move`, `product.product`

### 3. Lokaal testen

```bash
netlify dev
```

De app start op `http://localhost:8888`.

**Standaard inloggegevens (wijzig in productie!):**
- Admin: `admin` / `Admin@2024!`
- Technieker laadpalen: `jan.de.smedt` / `Tech@2024!`
- Technieker zonnepanelen: `peter.wouters` / `Tech@2024!`

### 4. Deployen naar Netlify

```bash
netlify deploy --prod
```

Of koppel de GitHub-repo aan Netlify voor automatische deploys.

**Stel omgevingsvariabelen in via Netlify UI:**
Site → Site settings → Environment variables

---

## Excel-importformaat

| Kolom | Verplicht | Voorbeeld |
|-------|-----------|-----------|
| odooId | Ja | 101 |
| internalRef | Ja | BEV-001 |
| name | Ja | Schroef M6x20 |
| unit | Nee | stuk |
| departments | Nee | laadpalen,zonnepanelen |
| category | Nee | bevestiging |

**departments-waarden:** `laadpalen`, `zonnepanelen`, `all` (voor alle afdelingen)
Meerdere afdelingen: kommagescheiden, bijv. `laadpalen,zonnepanelen`

Download het sjabloon via het beheerpaneel → Artikelen → "Sjabloon downloaden".

---

## Afdelingen uitbreiden

Om een nieuwe afdeling toe te voegen (bijv. `warmtepompen`):

1. **Backend** (`netlify/functions/lib/users.js`): voeg toe aan `DEPARTMENTS`
2. **Frontend** (`src/pages/AdminUsers.js`): voeg toe aan `DEPARTMENTS` array en `DEPT_LABELS`
3. **Frontend** (`src/pages/OrderPage.js`): voeg toe aan `DEPT_LABELS`
4. **CSS** (`src/components/UI.css`): voeg `.badge-dept-warmtepompen` toe

---

## Productie-aanbevelingen

1. **Database**: vervang de `/tmp` JSON-bestanden in de Netlify Functions door een echte database (bijv. [PlanetScale](https://planetscale.com/), [Supabase](https://supabase.com/) of [Fauna](https://fauna.com/)). `/tmp` op Netlify Functions is tijdelijk en wordt gereset.

2. **Wachtwoorden**: wijzig alle standaardwachtwoorden via het beheerpaneel vóór productiegebruik.

3. **JWT_SECRET**: gebruik een willekeurige string van minstens 32 tekens (bijv. `openssl rand -base64 48`).

4. **HTTPS**: Netlify voorziet dit automatisch.

5. **Odoo API-gebruiker**: maak een dedicated gebruiker aan met minimale rechten (alleen `stock.picking`, `stock.move`, `product.product` lezen/schrijven).

---

## Projectstructuur

```
├── netlify/
│   └── functions/
│       ├── lib/
│       │   ├── odoo.js          # Odoo XML-RPC client
│       │   ├── auth.js          # JWT helpers
│       │   ├── users.js         # Gebruikersbeheer
│       │   ├── articles.js      # Artikelopslag
│       │   └── orders.js        # Bestellingsopslag
│       ├── auth-login.js        # POST /login
│       ├── articles-get.js      # GET artikelen (gefilterd)
│       ├── articles-import.js   # POST Excel-import
│       ├── orders-create.js     # POST bestelling + Odoo picking
│       ├── orders-get.js        # GET bestellingen
│       └── users-manage.js      # CRUD gebruikers (admin)
├── src/
│   ├── context/AuthContext.js
│   ├── utils/api.js
│   ├── components/
│   │   ├── Layout.js / .css
│   │   └── UI.css
│   └── pages/
│       ├── Login.js
│       ├── OrderPage.js
│       ├── HistoryPage.js
│       ├── AdminUsers.js
│       └── AdminArticles.js
├── .env.example
├── netlify.toml
└── package.json
```
