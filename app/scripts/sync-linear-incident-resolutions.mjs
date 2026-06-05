import fs from "node:fs";
import path from "node:path";

const AUTOMATION_MEMORY_PATH =
  process.env.CODEX_HOME
    ? path.join(
        process.env.CODEX_HOME,
        "automations/ssfitness-linear-incident-resolution-sync/memory.md"
      )
    : path.join(
        process.env.HOME ?? "",
        ".codex/automations/ssfitness-linear-incident-resolution-sync/memory.md"
      );

function tryLoadDotEnvFiles() {
  const cwd = process.cwd();
  const candidates = [".env.local", ".env"].map((name) => path.join(cwd, name));
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const raw = fs.readFileSync(filePath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      if (!key) continue;
      if (process.env[key]) continue;
      let value = trimmed.slice(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (value) process.env[key] = value;
    }
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function optionalEnv(name) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

function loadSyncedLinearIssueIds() {
  if (!fs.existsSync(AUTOMATION_MEMORY_PATH)) return new Set();
  const text = fs.readFileSync(AUTOMATION_MEMORY_PATH, "utf8");

  const lines = text.split("\n");
  const startIdx = lines.findIndex((line) => line.trim() === "## Synced items");
  if (startIdx === -1) return new Set();

  const ids = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("## ")) break;
    const trimmed = line.trim();
    if (!trimmed.startsWith("- ")) continue;
    const id = trimmed.slice(2).trim().split(/\s+/)[0];
    if (id) ids.push(id);
  }
  return new Set(ids);
}

function appendSyncedLinearIssueId(id) {
  fs.mkdirSync(path.dirname(AUTOMATION_MEMORY_PATH), { recursive: true });
  const stamp = new Date().toISOString();
  const entryLine = `- ${id} # synced ${stamp}`;

  if (!fs.existsSync(AUTOMATION_MEMORY_PATH)) {
    fs.writeFileSync(
      AUTOMATION_MEMORY_PATH,
      `# SSFitness Linear incident resolution sync

- Created: ${stamp.slice(0, 10)}
- Last run: ${stamp.slice(0, 10)}

## Synced items

${entryLine}

## Run log

`,
      "utf8"
    );
    return;
  }

  const text = fs.readFileSync(AUTOMATION_MEMORY_PATH, "utf8");
  const lines = text.split("\n");
  const headerIdx = lines.findIndex((line) => line.trim() === "## Synced items");
  if (headerIdx === -1) {
    fs.appendFileSync(
      AUTOMATION_MEMORY_PATH,
      `\n## Synced items\n\n${entryLine}\n`,
      "utf8"
    );
    return;
  }

  let insertIdx = headerIdx + 1;
  while (insertIdx < lines.length && lines[insertIdx].trim() === "") insertIdx++;
  while (
    insertIdx < lines.length &&
    !lines[insertIdx].trim().startsWith("## ") &&
    lines[insertIdx].trim().startsWith("- ")
  ) {
    insertIdx++;
  }
  lines.splice(insertIdx, 0, entryLine);
  fs.writeFileSync(AUTOMATION_MEMORY_PATH, lines.join("\n"), "utf8");
}

async function linearGraphql(query, variables) {
  const apiKey = requireEnv("SSFITNESS_LINEAR_API_KEY");
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Linear API failed with ${response.status}: ${body.slice(0, 500)}`);
  }

  const data = await response.json();
  if (data?.errors?.length) {
    throw new Error(data.errors.map((e) => e.message).join("; "));
  }
  if (!data?.data) {
    throw new Error("Linear API returned no data");
  }
  return data.data;
}

async function searchCompletedIssues(term, { includeTeamFilter = true } = {}) {
  const filter = buildCompletedIssueFilterForSearch({ includeTeamFilter });

  const data = await linearGraphql(
    `
      query SearchIssues($term: String!, $filter: IssueFilter, $first: Int!) {
        searchIssues(term: $term, filter: $filter, first: $first) {
          nodes {
            id
            identifier
            title
            url
            completedAt
            updatedAt
          }
        }
      }
    `,
    { term, filter, first: 50 }
  );

  return Array.isArray(data?.searchIssues?.nodes) ? data.searchIssues.nodes : [];
}

function parseCsvEnv(name) {
  const value = optionalEnv(name);
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function buildCompletedIssueFilterForSearch({ includeTeamFilter = true } = {}) {
  const filter = {
    state: { type: { eq: "completed" } },
  };

  const teamId = optionalEnv("SSFITNESS_LINEAR_TEAM_ID");
  if (includeTeamFilter && teamId) filter.team = { id: { eq: teamId } };

  return filter;
}

function buildCompletedIncidentIssueFilterByLabels() {
  const filter = buildCompletedIssueFilterForSearch();
  const labelIds = parseCsvEnv("SSFITNESS_LINEAR_INCIDENT_LABEL_IDS");
  if (labelIds.length) {
    filter.labels = {
      some: {
        id: { in: labelIds },
      },
    };
  }
  return filter;
}

async function listCompletedIncidentIssuesByLabels() {
  const filter = buildCompletedIncidentIssueFilterByLabels();

  const data = await linearGraphql(
    `
      query Issues($filter: IssueFilter, $first: Int!) {
        issues(filter: $filter, first: $first) {
          nodes {
            id
            identifier
            title
            url
            completedAt
            updatedAt
          }
        }
      }
    `,
    { filter, first: 50 }
  );

  return Array.isArray(data?.issues?.nodes) ? data.issues.nodes : [];
}

async function listCompletedIncidentIssuesByLabelsNoTeam() {
  const filter = buildCompletedIssueFilterForSearch({ includeTeamFilter: false });
  const labelIds = parseCsvEnv("SSFITNESS_LINEAR_INCIDENT_LABEL_IDS");
  if (labelIds.length) {
    filter.labels = {
      some: {
        id: { in: labelIds },
      },
    };
  }

  const data = await linearGraphql(
    `
      query Issues($filter: IssueFilter, $first: Int!) {
        issues(filter: $filter, first: $first) {
          nodes {
            id
            identifier
            title
            url
            completedAt
            updatedAt
          }
        }
      }
    `,
    { filter, first: 50 }
  );

  return Array.isArray(data?.issues?.nodes) ? data.issues.nodes : [];
}

async function fetchIssueDetails(issueId) {
  const data = await linearGraphql(
    `
      query IssueDetails($id: String!) {
        issue(id: $id) {
          id
          identifier
          title
          url
          description
          completedAt
          updatedAt
          comments {
            nodes {
              id
              body
              createdAt
              user {
                name
              }
            }
          }
        }
      }
    `,
    { id: issueId }
  );

  return data.issue;
}

async function createLinearComment(issueId, body) {
  const data = await linearGraphql(
    `
      mutation CommentCreate($input: CommentCreateInput!) {
        commentCreate(input: $input) {
          success
          comment {
            id
          }
        }
      }
    `,
    {
      input: {
        issueId,
        body,
      },
    }
  );

  if (!data?.commentCreate?.success) {
    throw new Error("Linear commentCreate returned success=false");
  }
}

function extractIncidentId(text) {
  if (!text) return null;
  const uuid =
    "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

  const tagged = new RegExp(
    `\\bincident[_ -]?id\\b\\s*[:=]\\s*(${uuid})\\b`,
    "i"
  );
  const taggedMatch = text.match(tagged);
  if (taggedMatch?.[1]) return taggedMatch[1];

  const fallback = text.match(new RegExp(`\\b(${uuid})\\b`, "i"));
  return fallback?.[1] ?? null;
}

function extractCommitSha(text) {
  if (!text) return null;
  const match = text.match(/\b[0-9a-f]{7,40}\b/gi);
  if (!match?.length) return null;
  return match[0];
}

function summarizeIssue(issue) {
  const parts = [];
  if (issue?.description) parts.push(issue.description);
  const comments = Array.isArray(issue?.comments?.nodes) ? issue.comments.nodes : [];
  const sorted = comments
    .slice()
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const tail = sorted.slice(-3);
  for (const comment of tail) {
    if (comment?.body) parts.push(comment.body);
  }
  const raw = parts.filter(Boolean).join("\n\n---\n\n");

  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const likely = lines.filter((line) =>
    /(fix|fixed|resolve|resolved|deploy|deployed|merge|merged|release|released|ship|shipped|prod|pwa|hotfix)/i.test(
      line
    )
  );

  const selected = (likely.length ? likely : lines).slice(0, 12).join("\n");
  const summary = selected.length > 900 ? selected.slice(0, 900) + "…" : selected;

  return {
    summary: summary || "Completed SSFitness client incident ticket.",
    commit_sha: extractCommitSha(raw),
    incident_id: extractIncidentId(raw),
  };
}

async function syncResolutionToApp(payload) {
  const secret = requireEnv("INCIDENT_WEBHOOK_SECRET");
  const baseUrl =
    optionalEnv("INCIDENT_SYNC_BASE_URL") ||
    optionalEnv("SYNC_BASE_URL") ||
    optionalEnv("SMOKE_BASE_URL") ||
    optionalEnv("NEXT_PUBLIC_APP_URL") ||
    "http://localhost:3001";

  const url = `${baseUrl.replace(/\/$/, "")}/api/incidents/sync-resolution`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-incident-secret": secret,
    },
    body: JSON.stringify(payload),
  });

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      `Sync endpoint failed with ${response.status}: ${JSON.stringify(json)}`
    );
  }
  return json;
}

async function main() {
  tryLoadDotEnvFiles();

  const missing = [];
  for (const name of ["SSFITNESS_LINEAR_API_KEY", "INCIDENT_WEBHOOK_SECRET"]) {
    if (!optionalEnv(name)) missing.push(name);
  }
  if (missing.length) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          error: "missing env",
          missing,
          hint: "Set env vars (or .env.local) and re-run this script.",
        },
        null,
        2
      )
    );
    process.exit(2);
  }

  const synced = loadSyncedLinearIssueIds();
  const terms = ["client-incident", "ssf-pwa", "SSFitness client incident"];
  const issueById = new Map();
  const hasTeamFilter = Boolean(optionalEnv("SSFITNESS_LINEAR_TEAM_ID"));

  // First: pull completed issues by configured label/team filters (more reliable
  // than text search alone).
  const labeled = await listCompletedIncidentIssuesByLabels();
  for (const issue of labeled) {
    if (issue?.id) issueById.set(issue.id, issue);
  }

  for (const term of terms) {
    const results = await searchCompletedIssues(term);
    for (const issue of results) {
      if (issue?.id) issueById.set(issue.id, issue);
    }
  }

  // If nothing matched and a team filter is configured, retry without team
  // scoping. This prevents a stale/incorrect SSFITNESS_LINEAR_TEAM_ID from
  // causing a false "no-op" run.
  if (!issueById.size && hasTeamFilter) {
    const labeledNoTeam = await listCompletedIncidentIssuesByLabelsNoTeam();
    for (const issue of labeledNoTeam) {
      if (issue?.id) issueById.set(issue.id, issue);
    }

    for (const term of terms) {
      const results = await searchCompletedIssues(term, { includeTeamFilter: false });
      for (const issue of results) {
        if (issue?.id) issueById.set(issue.id, issue);
      }
    }
  }

  const candidates = Array.from(issueById.values()).sort((a, b) =>
    String(b.completedAt ?? b.updatedAt ?? "").localeCompare(
      String(a.completedAt ?? a.updatedAt ?? "")
    )
  );

  const toSync = candidates.filter((issue) => issue?.id && !synced.has(issue.id));
  if (!toSync.length) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          synced: 0,
          skipped: candidates.length,
          note: "No new completed incident issues found to sync.",
        },
        null,
        2
      )
    );
    return;
  }

  const results = [];
  for (const issue of toSync) {
    const details = await fetchIssueDetails(issue.id);
    const { summary, commit_sha, incident_id } = summarizeIssue(details);

    const syncPayload = {
      ...(incident_id ? { incident_id } : { linear_issue_id: details.id }),
      linear_issue_url: details.url,
      title: details.title,
      summary,
      ...(commit_sha ? { commit_sha } : {}),
    };

    const syncResult = await syncResolutionToApp(syncPayload);

    await createLinearComment(
      details.id,
      "Client PWA update record was published to SSFitness (via `/api/incidents/sync-resolution`)."
    );

    appendSyncedLinearIssueId(details.id);

    results.push({
      linear_issue_id: details.id,
      linear_issue_identifier: details.identifier,
      incident_id: syncResult?.incident_id ?? null,
      commit_sha: commit_sha ?? null,
      synced: true,
    });
  }

  console.log(JSON.stringify({ ok: true, synced: results.length, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
