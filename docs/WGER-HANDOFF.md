# wger Handoff

SSFitness uses wger as the exercise/workout knowledge backbone.

## App Integration

The app reads exercise options through:

```text
/api/wger/exercises
```

The proxy lives in `app/src/app/api/wger/exercises/route.ts` and calls `fetchWgerExercises` from `app/src/lib/wger.ts`.

Environment:

```bash
WGER_API_BASE_URL=https://workouts.stryvsocietyfit.com
WGER_API_TOKEN=
```

Public exercise lookup does not require `WGER_API_TOKEN`. Private routine sync to wger requires a token and the multi-endpoint routine API once Stryv wants data mirrored into wger itself. The app now persists StryvAdmin workout routines in Supabase through `/api/admin/workout-routines`, exposes published routines through `/api/client/workout-routines`, and records whether wger sync was requested/configured.

## Data Shape

The app normalizes wger exercise info into:

```ts
type WgerExercise = {
  id: number;
  name: string;
  category: string;
  muscles: string[];
  equipment: string[];
  description: string;
};
```

If wger is unreachable or returns no usable data, the app falls back to a small local set of exercises so `/admin/workouts` remains usable.

## Admin Behavior

Open `/admin/workouts`.

Expected behavior:

- The Library panel shows `Source: <base url>` once loaded.
- Live wger exercises appear above local workout templates.
- Selecting an exercise changes the plan title.
- Local templates remain available even if wger falls back.
- Server-side routine persistence is available at `/api/admin/workout-routines`; a publish request also creates an `/api/admin/publish` workout-plan record for client delivery.

## Self-Hosted Cloud Stack

The deploy stack is in `infra/wger`.

Services:

- Caddy: public HTTPS for `workouts.stryvsocietyfit.com`.
- nginx: required by wger for static/media serving.
- web: `wger/server:latest` Django/API app.
- Postgres: persistent wger database.
- Redis: cache and Celery broker/backend.
- Celery worker/beat: exercise, image, video, ingredient sync, and cache warmup tasks.

Primary docs:

- `infra/wger/README.md`
- `infra/wger/docker-compose.yml`
- `infra/wger/config/prod.env.example`
- `infra/wger/.env.example`
- `infra/wger/scripts/backup.sh`

## Cloud Deploy Summary

Provision a small VM:

- 2 vCPU
- 4 GB RAM
- 60 GB persistent disk
- Ubuntu 24.04 LTS
- ports `80` and `443` open

DNS:

```txt
workouts.stryvsocietyfit.com A <server-ip>
```

On the VM:

```bash
git clone <repo-url> /opt/stryvfit
cd /opt/stryvfit/infra/wger
cp .env.example .env
cp config/prod.env.example config/prod.env
```

Generate and fill secrets in `.env` and `config/prod.env`, then:

```bash
docker compose pull
docker compose up -d
docker compose ps
```

Warm cache:

```bash
docker compose exec web python3 manage.py sync-exercises
docker compose exec web python3 manage.py download-exercise-images
docker compose exec web python3 manage.py download-exercise-videos
docker compose exec web python3 manage.py warmup-exercise-api-cache --force
```

## Health Checks

From anywhere with network access:

```bash
curl -fsS https://workouts.stryvsocietyfit.com/api/v2/exerciseinfo/?limit=1
curl -fsS https://app.stryvsocietyfit.com/api/wger/exercises?limit=1
```

Local app check:

```bash
curl -fsS http://localhost:3001/api/wger/exercises?limit=2
```

## Backups

Run on the VM:

```bash
cd /opt/stryvfit/infra/wger
bash scripts/backup.sh
```

The backup script exports:

- Postgres dump: `wger-postgres-<timestamp>.sql.gz`
- Media archive: `wger-media-<timestamp>.tgz`

Ship backups to object storage after the first production VM is live.

## Next Integration Step

When Stryv is ready to publish real routines:

1. Create a wger API token for the service account.
2. Set `WGER_API_TOKEN` in the app environment.
3. Map saved Stryv workout blocks to wger routine/day/slot/slot-entry/config objects.
4. Persist Stryv client-to-wger user/account linkage in Supabase.
5. Add a worker that drains routines with `wger_sync_status = 'pending'` and writes each object to the wger routine API.
