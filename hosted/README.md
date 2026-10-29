# TasteTrail / Sidequests

A three-act cultural exchange for two people. Search and select a cultural starting point for each person, then discover music, film, and a book through Qloo. Keep an act locked, replace an act, or remix the unlocked acts. Result-list positions are evidence of aggregate affinity, not proof of an individual's preferences.

## Architecture

The frontend is served by a Cloudflare Worker. Its deterministic planner confirms the selected entities using Qloo Search and compares the two Qloo Insights lists for each category. It does not call a language model. No API key is delivered to the browser: configure `QLOO_API_KEY` as a server runtime secret. Synthetic examples are explicitly labelled when a key is absent; Qloo failures are not replaced with examples.

To support multiple Worker instances, the client carries an AES-GCM authenticated and encrypted session token, derived from the server secret. A session expires after one hour and has a 12-revision limit. Replaying an older valid token can revisit an earlier state; rate limiting is per isolate and is not a substitute for production-grade distributed abuse controls. No user database is used. Rotating the Qloo key invalidates existing sessions.

`source/` contains readable source files. `python generate.py` produces the self-contained `worker/index.js` from them. The build copies that file and the Site manifest to `dist/`. Run `node test-worker.mjs` for a mock Qloo search, plan, cross-request lock and replacement, rejection of altered session tokens, and the no-key synthetic mode. The test is simulated and does not prove the live service is working. The deployment secret and source repository credentials must never be committed.

Qloo data and API use are subject to Qloo's terms. This project is independent and is not endorsed by Qloo. Source code is MIT licensed.
