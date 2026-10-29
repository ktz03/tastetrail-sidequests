# TasteTrail / Sidequests — Vercel edition

This adaptation hosts static files from `public/` and provides Node.js Vercel Functions under `api/`. The functions invoke the same deterministic Qloo planner as the Sites Worker. Set `QLOO_API_KEY` as a Vercel server-side environment variable before deploying; never commit it. Without it the app is explicitly marked as fictional demo mode.

Import the public Git repository in Vercel, choose this directory as its root, select Other framework, configure the environment variable for Production, and deploy. Make sure production deployment protection does not prevent the intended judges from accessing the site. The configuration permits functions to run up to 90 seconds; actual limits depend on the account and Fluid Compute settings. Verify a full search, plan and swap after deployment.

The browser holds an authenticated encrypted session token; it can be replayed until its one-hour expiry. A session supports up to 12 revisions. The rate limit is per function instance, not a distributed security control. Rotating the key invalidates existing tokens. `source/` and `generate.py` regenerate `worker/index.js`; `public/` mirrors `source/public/`. Run `npm test` for mocked function requests. No test proves live Qloo or public access.

The Vercel Web Handler interface is documented at https://vercel.com/docs/functions/runtimes/node-js . Qloo data remains subject to Qloo's terms. This project is independent and MIT licensed.
