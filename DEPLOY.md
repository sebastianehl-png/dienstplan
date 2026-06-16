# Kostenloses Deployment: Vercel + Neon (EU)

Ziel: eine dauerhaft erreichbare Test-URL, die dein Kollege im Browser öffnen kann –
unabhängig von deinem Rechner. Beide Dienste haben einen kostenlosen Tarif.

> **Datenschutz:** Region in Neon und Vercel jeweils **EU** wählen. Da echte
> Personaldaten verarbeitet würden, ist für den Produktivbetrieb je ein
> Auftragsverarbeitungsvertrag (AVV/DPA) mit Neon und Vercel nötig. Für einen
> Test mit den Demo-Daten ist das unkritisch.

Das Projekt ist bereits auf PostgreSQL umgestellt. Du musst nur noch die Konten
anlegen und die folgenden Schritte ausführen.

---

## 1. Datenbank bei Neon anlegen (kostenlos)

1. Auf https://neon.tech registrieren.
2. **New Project** → Region **EU (Frankfurt / eu-central-1)** wählen.
3. Unter **Connection string** den Postgres-String kopieren. Es gibt zwei:
   - **Pooled** (…-pooler…): für die App (Vercel).
   - **Direct** (ohne -pooler): für die Migrationen.

---

## 2. Datenbank einrichten (einmalig, lokal)

Trage den **Direct**-String vorübergehend in `dienstplan/.env` als `DATABASE_URL` ein, dann:

```bash
cd dienstplan
npx prisma migrate dev --name init   # erstellt die Tabellen in Neon
npm run seed                         # legt Demo-Nutzer + Beispieldaten an
```

`SEED_PASSWORD` aus `.env` ist das Passwort der Test-Logins (Default `Test-Klinik-2026`).
Danach kannst du in `.env` wieder auf den **Pooled**-String wechseln (für `npm run dev`).

> Sag mir Bescheid – sobald der Connection-String in `.env` steht, kann ich
> `migrate` und `seed` für dich ausführen.

---

## 3. Code zu GitHub pushen

Vercel deployt aus einem Git-Repo. Im Ordner `dienstplan/` ist bereits ein Git-Repo.

```bash
cd dienstplan
git add -A
git commit -m "Dienstplanung – deploybar (Postgres)"
# Neues, PRIVATES Repo auf github.com anlegen, dann:
git remote add origin https://github.com/<DEIN-NUTZER>/dienstplan.git
git branch -M main
git push -u origin main
```

`.env` wird **nicht** mit hochgeladen (steht in `.gitignore`) – Secrets bleiben lokal. ✅

---

## 4. Bei Vercel deployen (kostenlos)

1. Auf https://vercel.com mit GitHub anmelden.
2. **Add New… → Project** → das `dienstplan`-Repo importieren.
3. Framework wird als **Next.js** erkannt (Standardeinstellungen passen).
4. Unter **Environment Variables** eintragen:
   | Name | Wert |
   |------|------|
   | `DATABASE_URL` | **Pooled** Neon-String |
   | `SESSION_SECRET` | langer Zufallswert (steht in deiner `.env`) |
   | `SEED_PASSWORD` | dein Test-Passwort |
5. **Deploy** klicken. Nach ein paar Minuten gibt es eine URL wie
   `https://dienstplan-xxx.vercel.app`.

Da lokal und Cloud dieselbe Neon-Datenbank nutzen, sind die Demo-Daten aus
Schritt 2 sofort da – dein Kollege kann sich direkt einloggen.

---

## 5. Logins für den Kollegen

(Passwort = dein `SEED_PASSWORD`)
- Admin: `admin@klinik.de`
- Sub-Admin: `bernd.christ@klinik.de`
- Arzt: `anna.bauer@klinik.de` (u. a.)

---

## Spätere Schema-Änderungen

Wenn sich das Datenmodell ändert: lokal `npx prisma migrate dev --name <was>`
(gegen Direct-String) ausführen, committen, pushen → Vercel deployt neu.
Die Tabellen-Änderung in Neon vorher mit `npm run db:deploy` (Direct-String) einspielen.

## Sicherheit vor „echtem" Betrieb
- Demo-Passwörter ersetzen / echte Nutzer anlegen, Admin-Demo deaktivieren.
- `SESSION_SECRET` geheim halten (nur in Vercel/`.env`).
- AVV mit Neon und Vercel abschließen, EU-Region bestätigen, Backups einrichten.
