const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://localhost:3001';

async function main() {
  const incident = {
    source: 'support-smoke',
    route: '/admin/pulse',
    message: 'Smoke test: support intake pipeline degraded',
    severity: 'high',
    fingerprint: `smoke-support-pipeline-${Date.now()}`,
    context: { smoke: true, runner: 'scripts/smoke-support-pipeline.mjs' },
    admin_action: 'Smoke test only.',
  };

  const dryRun = await fetch(`${baseUrl}/api/incidents?dry_run=1`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.INCIDENT_WEBHOOK_SECRET
        ? { 'x-incident-secret': process.env.INCIDENT_WEBHOOK_SECRET }
        : {}),
    },
    body: JSON.stringify(incident),
  });
  const dryRunJson = await dryRun.json();
  if (!dryRun.ok || !dryRunJson?.dry_run || dryRunJson?.linear?.priority !== 2) {
    throw new Error(`Incident dry-run smoke failed: ${JSON.stringify(dryRunJson)}`);
  }

  const health = await fetch(`${baseUrl}/api/incidents`, {
    cache: 'no-store',
    headers: {
      ...(process.env.INCIDENT_WEBHOOK_SECRET
        ? { 'x-incident-secret': process.env.INCIDENT_WEBHOOK_SECRET }
        : {}),
    },
  });
  const healthJson = await health.json();
  if (!health.ok || !Array.isArray(healthJson.incidents) || !Array.isArray(healthJson.updates)) {
    throw new Error(`Incident health smoke failed: ${JSON.stringify(healthJson)}`);
  }

  const liveRequested = process.env.RUN_LIVE_INCIDENT_SMOKE === '1';
  if (!liveRequested) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: 'dry-run',
          checked: ['incident validation', 'Linear priority mapping', 'health endpoint shape'],
          liveIncidentSkipped: 'set RUN_LIVE_INCIDENT_SMOKE=1 with Supabase and Linear env to create a real ticket',
        },
        null,
        2
      )
    );
    return;
  }

  const live = await fetch(`${baseUrl}/api/incidents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.INCIDENT_WEBHOOK_SECRET
        ? { 'x-incident-secret': process.env.INCIDENT_WEBHOOK_SECRET }
        : {}),
    },
    body: JSON.stringify(incident),
  });
  const liveJson = await live.json();
  if (!live.ok || !liveJson.incident?.id) {
    throw new Error(`Live incident smoke failed: ${JSON.stringify(liveJson)}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: 'live',
        incidentId: liveJson.incident.id,
        linear: liveJson.linear ?? null,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
