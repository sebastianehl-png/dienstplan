# Dienstplanung Oberärzte — Prototyp

Web-App zur jährlichen Dienstplanung. Oberärzte tragen Urlaub, Sonderurlaub und
Freiwünsche ein; per Knopfdruck erstellt ein Admin einen vorläufigen Dienstplan
mit Engpassbericht und gibt ihn frei. Fachliche Grundlage: `../Konzept.md`.

## Technik
- **Next.js 16** (React, TypeScript) + **Tailwind CSS**
- **Prisma 7** mit **PostgreSQL** (Neon, EU-Region) über einen Driver-Adapter.
- Planungs-Engine als Heuristik in `src/lib/scheduler.ts` (austauschbar gegen
  einen Constraint-Solver wie OR-Tools CP-SAT).

## Erststart
```bash
cd dienstplan
npm install
cp .env.example .env        # DATABASE_URL (Neon), SESSION_SECRET, SEED_PASSWORD eintragen
npx prisma migrate dev      # legt die Tabellen an
npm run seed                # Beispieldaten: 1 Admin + 20 Oberärzte, NRW-Feiertage
npm run dev                 # http://localhost:3000
```

## Deployment
Kostenloses Cloud-Deployment (Vercel + Neon, EU): siehe **[DEPLOY.md](DEPLOY.md)**.

## Demo-Logins (Passwort jeweils: `passwort`)
- **Admin:** `admin@klinik.de`
- **Arzt:** `anna.bauer@klinik.de` (Kat. 1), `mara.neumann@klinik.de` (Kat. 2) u. a.

## Funktionen
- **Login** pro Arzt (E-Mail/Passwort, gehashte Passwörter, signierte Session).
- **Mein Kalender:** Urlaub / Sonderurlaub / Freiwunsch je Tag eintragen.
  - Urlaubskonto 30 Werktage (Mo–Fr) mit Warnung bei Überschreitung.
  - First-come-first-serve: max. 5 gleichzeitig im Urlaub (harte Sperre).
  - Sonderurlaub ohne Limit, zählt nicht ins Konto.
- **Team-Abwesenheiten:** Jahresübersicht, zeigt Auslastung pro Tag.
- **Admin – Plan erstellen:** vorläufigen Plan berechnen, Engpassbericht
  (unbesetzte Stellen, nicht erfüllte Freiwünsche, Verteilung), dann freigeben.
- **Dienstplan:** freigegebener Plan für alle sichtbar; eigene Dienste markiert.
- **Admin – Nutzerverwaltung & Einstellungen** (Limits, Feiertage NRW).

## Dienstregeln (in der Engine abgebildet)
- Mo–Do: ein Kat.-1-Arzt (Vordergrund + HK).
- Wochenende (Fr–So-Block): Kat. 1 macht HK + Vordergrund Fr; Vordergrund Sa+So
  durch Kat. 2 (Split) oder denselben Kat.-1-Arzt (Solo).
- Feiertag: wie ein einzelner Wochenendtag (HK + Vordergrund).
- Montag nach Wochenenddienst frei.
- Möglichst gleichmäßige Verteilung; Kat. 2 übernimmt mehr Wochenend-Vordergründe.

## Hilfsskripte
```bash
npx tsx scripts/test-scheduler.ts   # prüft Abdeckung & Verteilung gegen Seed-Daten
npx tsx scripts/make-plan.ts        # erzeugt einen Demo-Plan in der DB
```

## Vor dem Produktivbetrieb (offen)
- PostgreSQL (EU) statt SQLite; `SESSION_SECRET` durch echten Zufallswert ersetzen.
- DSGVO: AVV mit Hoster, HTTPS, Backup, Audit-Log.
- Passwort-Reset / „Passwort ändern" für Ärzte.
