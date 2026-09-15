# dashboard_apparentati

Dashboard di casa (presenze a cena, turni pulizia) mostrata su una TV LG webOS e alimentata da un'app Android. Supabase è l'unico datastore condiviso, nessun backend proprio. Specifiche: [PRD.md](PRD.md), [PRP.md](PRP.md).

## Struttura

- `supabase/migrations/` — schema e policy RLS (Fase 0)
- `tv-app/` — app webOS, sola lettura (Fase 1)
- `scripts/hermes/` — script Python di rinnovo Developer Mode (Fase 2)
- `mobile-app/` — app Android Flutter (Fase 3)

## Fase 0 — passi manuali prima della Fase 1

1. **Crea il progetto su [supabase.com](https://supabase.com)**, piano Free. Conserva la password del database in un password manager, mai nel repo.

2. **Esegui le migrazioni dal SQL Editor** del progetto, in quest'ordine, incollando ed eseguendo il contenuto di ciascun file:
   1. `supabase/migrations/20260915000000_initial_schema.sql`
   2. `supabase/migrations/20260915000001_rls_policies.sql`

3. **Popola a mano `roommates` e `cleaning_tasks`**, dal Table Editor oppure dal SQL Editor (che gira con un ruolo privilegiato, quindi non è bloccato dalla RLS). Esempio con nomi segnaposto da sostituire:

   ```sql
   insert into roommates (name) values ('Nome 1'), ('Nome 2');
   insert into cleaning_tasks (name, sort_order) values ('Cucina', 1), ('Bagno', 2);
   ```

   `dinner_presence` e `cleaning_shifts` restano vuote.

4. **Copia URL e publishable key nel tuo `.env` locale:**

   ```powershell
   Copy-Item .env.example .env
   ```

   Compila `SUPABASE_URL` (`https://<project-ref>.supabase.co`, il ref è nell'indirizzo della dashboard dopo `/project/`) e `SUPABASE_PUBLISHABLE_KEY` (Project Settings → API Keys, inizia con `sb_publishable_`). Non usare le chiavi legacy `anon`/`service_role`, in dismissione entro fine 2026, e **mai** la *secret key*: bypassa la RLS e non deve finire in nessuna app né nel repo. `.env` è già escluso da `.gitignore`.

**Checkpoint Fase 0 (dal PRP):** dalla dashboard web di Supabase riesci a leggere e scrivere righe di test. Solo dopo si passa alla Fase 1.
