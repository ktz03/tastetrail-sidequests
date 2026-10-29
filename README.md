# TasteTrail / Sidequests

A cultural exchange for two curious people: search and confirm one cultural seed each, then build a three-act programme of music, film, and a book to explore. Choose shared ground or trade worlds. Lock a favorite act, swap a single act, or rethink every unlocked act. The bounded planner queries Qloo again, preserves kept scenes, and excludes previous rejected or remixed candidates.

## Product and planning

- Search results are selectable, with category and available disambiguation. Stable Qloo IDs identify choices.
- Each act comes from two independent Qloo lists. Shared picks are ordered by their summed positions within that category. One-sided picks are invitations to explore, not predictions of the other person's preferences.
- The shared route prefers overlap. Trade worlds prioritizes person A's music, person B's film and a shared book, with explicit fallback when a preferred lane has no candidates.
- Locks and exclusions are checked against server-side session state. A single-act swap preserves the other acts without locking them. A full remix excludes the current unlocked picks so it seeks another route.
- Recorded tool steps show real operation status and duration. These are not generated model thoughts. JSON export contains the mode, programme, ranks and trace.
- The planner is deterministic; this build does not call an LLM or import an agent framework. Sessions are kept in memory for one hour and up to 12 revisions, and are lost when the server restarts.
- A failed category remains visibly unavailable with a retry action. No result, duration, venue availability, streaming link, or causal taste explanation is invented.

## Run locally

Requires Node.js 20 or later. No packages need to be installed.

The `hosted/` directory in the public repository contains the complete Cloudflare Worker adaptation, including its source, generator and simulated tests. See [hosted/README.md](hosted/README.md) for its session and rate-limit behavior. The [vercel/](vercel/) directory contains the Vercel adaptation and its simulated tests.

```sh
npm start
```

Open <http://127.0.0.1:3000>. Without a server-side `QLOO_API_KEY`, the UI shows explicitly labeled, fictional examples. They are not Qloo results or personalized to inputs. The key's presence does not prove it works. When a key is configured, errors are shown as errors rather than replaced by examples.

For a real Qloo test, obtain an event-issued credential through the [official hackathon guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide#getting-your-api-key). Locally, create `Qloo-key.txt` with a `QLOO_API_KEY=` line containing your key, then restart the server. The file is ignored by Git and must not be included in an archive or public repository once filled. Alternatively set the key in the shell or deployment secret store; the environment variable takes precedence. Do not commit it or share it with the browser.

PowerShell:

```powershell
$env:QLOO_API_KEY = '<your-event-key>'
npm start
```

The key is read by the server and sent only in the `X-Api-Key` header to `https://hackathon.api.qloo.com`. Do not place private identity or personal data in the cultural-entity fields. The server does not save inputs. For hosting, set `HOST=0.0.0.0` and `PORT` as required by the host; configure the credential as a secret. The included in-memory request limit is a small development safeguard, not a production-grade quota or abuse control. Review host rate limiting and Qloo quotas before opening a demo publicly.

## Tests and status

```sh
npm test
```

Automated tests simulate Qloo responses, including lock retention, cumulative vetoes, single-act replacement, full remix, invalid selections and upstream failure. List intersection depends on the returned top 20, so no overlap is not proof that no shared taste exists. Qloo can be slow or unavailable for a category; the UI keeps successful scenes and offers a retry for missing ones.

## References

- [Qloo search API](https://github.com/qloo/docs-public/blob/main/reference/get-search.md), [Qloo Insights example](https://github.com/qloo/docs-public/blob/main/reference/basic-insights-use-case.md), and [safe use guidance](https://github.com/qloo/qloo-hackathon-kit/blob/main/docs/SAFE_USE.md).
- [Taste Trail](https://github.com/aibeginnermcp/taste-trail-qloo) demonstrates Qloo-backed cultural exploration; [TasteBridge](https://github.com/Daniel221287/tastebridge-qloo) addresses two-person recommendation. These projects informed the analysis; this implementation was written separately. Similar approaches exist and no originality or superiority claim is made.
- [CopilotKit](https://github.com/CopilotKit/CopilotKit), [LangGraph](https://github.com/langchain-ai/langgraph), and [assistant-ui](https://github.com/assistant-ui/assistant-ui) informed the interaction concepts: human confirmation, explicit state and visible tool receipts. No source code or packages from those projects are included, and this app does not claim to implement their frameworks.

This project is independent and is not endorsed by Qloo. The MIT license applies to this project's source; Qloo data remains subject to Qloo's terms.

