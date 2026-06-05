# Lokaal starten — stap voor stap

## Vereisten

- Node.js 18 of hoger → https://nodejs.org
- Toegang tot je Odoo 19 omgeving

---

## Stap 1 — Afhankelijkheden installeren

Open een terminal in de projectmap en voer uit:

```bash
npm install
```

---

## Stap 2 — Odoo API-sleutel instellen

Voer het setup-script uit. Dit vraagt je Odoo-gegevens en schrijft `.env.local` aan:

```bash
npm run setup-odoo
```

Het script vraagt:
- Odoo URL (bijv. `https://jouwbedrijf.odoo.com`)
- Database naam
- Gebruikersnaam (e-mailadres)
- Wachtwoord (wordt **niet** opgeslagen)

### Daarna: API-sleutel manueel kopiëren uit Odoo

Odoo geeft de ruwe API-sleutel enkel via de interface terug (om veiligheidsredenen).

1. Ga in Odoo naar **Instellingen → Gebruikers & Bedrijven → Gebruikers**
2. Open de gebruiker waarmee de app verbinding maakt
3. Klik op het tabblad **"API-sleutels"**
4. Klik **"Sleutel aanmaken"** → geef als naam `bestelportaal-<datum>`
5. **Kopieer de sleutel** (je ziet hem maar één keer!)
6. Open `.env.local` en vervang `HIER_JOUW_API_SLEUTEL_PLAKKEN` door de gekopieerde sleutel

### Odoo locatie-ID's en picking-type ID invullen

Open Odoo met debug-modus: voeg `?debug=1` toe aan de URL.

**Picking type ID:**
- Ga naar Voorraadbeheer → Configuratie → Bewerkingstypes
- Open "Interne overboekingen" (of het type dat je wil gebruiken)
- Kijk in de URL: `?id=2` → ID is 2

**Locatie ID's:**
- Ga naar Voorraadbeheer → Configuratie → Locaties
- Open de bronlocatie (bijv. "WH/Stock") → noteer het ID
- Open de bestemmingslocatie (bijv. "Techniekerbus" of een picklocatie) → noteer het ID

Vul in `.env.local`:
```
ODOO_PICKING_TYPE_ID=2
ODOO_SOURCE_LOCATION_ID=8
ODOO_DEST_LOCATION_ID=5
```

---

## Stap 3 — Lokaal starten

```bash
npm run dev
```

Dit start **twee processen tegelijk**:
- API-server op `http://localhost:3001`
- React frontend op `http://localhost:3000`

Open je browser op **http://localhost:3000**.

**Standaard inloggegevens:**
| Gebruikersnaam | Wachtwoord | Rol | Afdeling |
|---|---|---|---|
| `admin` | `Admin@2024!` | Beheerder | Alle |
| `jan.de.smedt` | `Tech@2024!` | Technieker | Laadpalen |
| `peter.wouters` | `Tech@2024!` | Technieker | Zonnepanelen |

> Wijzig deze wachtwoorden via het beheerpaneel → Gebruikers vóór productiegebruik.

---

## Stap 4 — Odoo-verbinding testen

Na het inloggen als admin:
1. Ga naar **Bestellen**
2. Voeg een artikel toe aan de winkelwagen
3. Klik **"Bestelling plaatsen"**
4. Als het goed werkt zie je een Odoo picking-nummer (bijv. `WH/INT/00001`)
5. Controleer in Odoo → Voorraadbeheer → Transfers of de picking is aangemaakt

Als je een Odoo-fout ziet, controleer:
- Klopt de API-sleutel in `.env.local`?
- Heeft de Odoo-gebruiker rechten op `stock.picking` en `stock.move`?
- Kloppen de locatie-ID's?

---

## Deployen naar Netlify (later)

Wanneer alles lokaal werkt:

```bash
npm install -g netlify-cli
netlify login
netlify deploy --prod
```

Stel de omgevingsvariabelen in via:
Netlify dashboard → Site → Site settings → Environment variables

Kopieer alle waarden uit `.env.local`.
