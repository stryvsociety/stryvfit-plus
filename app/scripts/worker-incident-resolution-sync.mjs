const SEARCH_TERMS = ["client-incident", "ssf-pwa", "SSFitness client incident"];

function envValue(env, name) {
  const value = env?.[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requireEnv(env, name) {
  const value = envValue(env, name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function parseCsv(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function shouldRunForNewYorkFivePm(value = Date.now()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).formatToParts(date);

  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  return hour === "17" && minute === "00";
}

async function linearGraphql(env, query, variables) {
  const apiKey = requireEnv(env, "SSFITNESS_LINEAR_API_KEY");
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
    throw new Error(data.errors.map((error) => error.message).join("; "));
  }
  if (!data?.data) throw new Error("Linear API returned no data");
  return data.data;
}

function completedIssueFilter(env, { includeTeamFilter = true, includeLabels = false } = {}) {
  const filter = {
    state: { type: { eq: "completed" } },
  };

  const teamId = envValue(env, "SSFITNESS_LINEAR_TEAM_ID");
  if (includeTeamFilter && teamId) filter.team = { id: { eq: teamId } };

  const labelIds = parseCsv(envValue(env, "SSFITNESS_LINEAR_INCIDENT_LABEL_IDS"));
  if (includeLabels && labelIds.length) {
    filter.labels = { some: { id: { in: labelIds } } };
  }

  return filter;
}

async function listCompletedIncidentIssuesByLabels(env, { includeTeamFilter = true } = {}) {
  const labelIds = parseCsv(envValue(env, "SSFITNESS_LINEAR_INCIDENT_LABEL_IDS"));
  if (!labelIds.length) return [];

  const data = await linearGraphql(
    env,
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
    { filter: completedIssueFilter(env, { includeTeamFilter, includeLabels: true }), first: 50 }
  );

  return Array.isArray(data?.issues?.nodes) ? data.issues.nodes : [];
}

async function searchCompletedIssues(env, term, { includeTeamFilter = true } = {}) {
  const data = await linearGraphql(
    env,
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
    { term, filter: completedIssueFilter(env, { includeTeamFilter }), first: 50 }
  );

  return Array.isArray(data?.searchIssues?.nodes) ? data.searchIssues.nodes : [];
}

async function fetchIssueDetails(env, issueId) {
  const data = await linearGraphql(
    env,
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

async function createLinearComment(env, issueId, body) {
  const data = await linearGraphql(
    env,
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
    { input: { issueId, body } }
  );

  if (!data?.commentCreate?.success) {
    throw new Error("Linear commentCreate returned success=false");
  }
}

function extractIncidentId(text) {
  if (!text) return null;
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
  const tagged = new RegExp(`\\bincident[_ -]?id\\b\\s*[:=]\\s*(${uuid})\\b`, "i");
  const taggedMatch = text.match(tagged);
  if (taggedMatch?.[1]) return taggedMatch[1];

  const fallback = text.match(new RegExp(`\\b(${uuid})\\b`, "i"));
  return fallback?.[1] ?? null;
}

function extractCommitSha(text) {
  if (!text) return null;
  const match = text.match(/\b[0-9a-f]{7,40}\b/gi);
  return match?.[0] ?? null;
}

function summarizeIssue(issue) {
  const parts = [];
  if (issue?.description) parts.push(issue.description);
  const comments = Array.isArray(issue?.comments?.nodes) ? issue.comments.nodes : [];
  const tail = comments
    .slice()
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .slice(-3);
  for (const comment of tail) {
    if (comment?.body) parts.push(comment.body);
  }

  const raw = parts.filter(Boolean).join("\n\n---\n\n");
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const likely = lines.filter((line) =>
    /(fix|fixed|resolve|resolved|deploy|deployed|merge|merged|release|released|ship|shipped|prod|pwa|hotfix)/i.test(line)
  );
  const selected = (likely.length ? likely : lines).slice(0, 12).join("\n");
  const summary = selected.length > 900 ? `${selected.slice(0, 900)}...` : selected;

  return {
    commit_sha: extractCommitSha(raw),
    incident_id: extractIncidentId(raw),
    summary: summary || "Completed SSFitness client incident ticket.",
  };
}

async function syncResolutionToApp(env, payload) {
  const secret = requireEnv(env, "INCIDENT_WEBHOOK_SECRET");
  const baseUrl =
    envValue(env, "INCIDENT_SYNC_BASE_URL") ||
    envValue(env, "NEXT_PUBLIC_PUBLIC_URL") ||
    envValue(env, "NEXT_PUBLIC_APP_URL") ||
    "https://stryvsocietyfit.com";

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/incidents/sync-resolution`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-incident-secret": secret,
    },
    body: JSON.stringify(payload),
  });

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Sync endpoint failed with ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

async function collectCompletedIssues(env) {
  const issueById = new Map();
  const hasTeamFilter = Boolean(envValue(env, "SSFITNESS_LINEAR_TEAM_ID"));

  for (const issue of await listCompletedIncidentIssuesByLabels(env)) {
    if (issue?.id) issueById.set(issue.id, issue);
  }

  for (const term of SEARCH_TERMS) {
    for (const issue of await searchCompletedIssues(env, term)) {
      if (issue?.id) issueById.set(issue.id, issue);
    }
  }

  if (!issueById.size && hasTeamFilter) {
    for (const issue of await listCompletedIncidentIssuesByLabels(env, { includeTeamFilter: false })) {
      if (issue?.id) issueById.set(issue.id, issue);
    }

    for (const term of SEARCH_TERMS) {
      for (const issue of await searchCompletedIssues(env, term, { includeTeamFilter: false })) {
        if (issue?.id) issueById.set(issue.id, issue);
      }
    }
  }

  return Array.from(issueById.values()).sort((a, b) =>
    String(b.completedAt ?? b.updatedAt ?? "").localeCompare(String(a.completedAt ?? a.updatedAt ?? ""))
  );
}

export async function runIncidentResolutionSync(env, trigger = {}) {
  const scheduledTime = trigger.scheduledTime ? new Date(trigger.scheduledTime) : new Date();
  if (trigger.cron && !shouldRunForNewYorkFivePm(scheduledTime)) {
    return {
      ok: true,
      skipped: true,
      reason: "outside-5pm-et",
      scheduledTime: scheduledTime.toISOString(),
    };
  }

  const issues = await collectCompletedIssues(env);
  const results = [];

  for (const issue of issues.slice(0, 50)) {
    const details = await fetchIssueDetails(env, issue.id);
    const { summary, commit_sha, incident_id } = summarizeIssue(details);
    const payload = {
      ...(incident_id ? { incident_id } : { linear_issue_id: details.id }),
      linear_issue_url: details.url,
      title: details.title,
      summary,
      ...(commit_sha ? { commit_sha } : {}),
    };

    const syncResult = await syncResolutionToApp(env, payload);
    if (!syncResult?.deduped) {
      await createLinearComment(
        env,
        details.id,
        "Client PWA update record was published to SSFitness (via `/api/incidents/sync-resolution`)."
      );
    }

    results.push({
      deduped: Boolean(syncResult?.deduped),
      incident_id: syncResult?.incident_id ?? null,
      linear_issue_id: details.id,
      linear_issue_identifier: details.identifier,
      synced: true,
    });
  }

  return { ok: true, scanned: issues.length, synced: results.length, results };
}
