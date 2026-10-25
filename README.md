# Second Serving — local website

Second Serving is a food rescue coordination prototype: a live Kimi agent drafts restaurant donations, checks recipient eligibility, creates pickup offers, and finds another recipient when an offer is declined. People review details and confirm acceptance, collection, and receipt.

The complete website is hosted on your own computer at **http://localhost:4173**.

## Set up a fresh checkout

Requires Node.js 22.13 or newer. The local server has no third-party dependencies, so no package installation is needed.

1. Copy `.env.example` to `.env.local`.
2. Add your own Moonshot/Kimi API key to `MOONSHOT_API_KEY` in that local file.
3. Run `npm start` or `node local-server.mjs`.
4. Open http://localhost:4173.

The repository contains no API keys. `.env.local` is ignored by Git. Practice mode works without a key; live mode requires a usable Kimi API account. Never put a credential in `public/`, a commit, or an issue.

## Start

Double-click **Start Second Serving.cmd**, or open a terminal in this folder and run:

```text
node local-server.mjs
```

Node.js 22 or newer is required. No packages need to be installed for local hosting.

## Use

1. Open http://localhost:4173 in Chrome or Edge on the same computer.
2. Click **Try a guided rescue**.
3. Add the sample donation and confirm its details.
4. Decline the first offer to practice automatic reassignment.
5. Accept the replacement, confirm pickup, then confirm receipt.

Your supplied Second Serving logo appears in the sidebar and overview. All organizations, pickup estimates, and scenarios are fictional. Data is saved in this browser, so other devices and browsers have separate workspaces.

## Coordinator

The live **Kimi coordinator** is connected using `kimi-k2.6`. Real API checks passed for message drafting, tool-based eligibility, offer creation, and reassignment after a decline. Browser drafting and offer creation were also verified. Nineteen automated checks passed in addition to these live tests.

For a clean presentation, open **AI coordinator → Start fresh live demo**, confirm the reset, then choose **Use example → Draft with AI**. Review all fields, complete missing information, and confirm. Declining the resulting offer triggers a new live Kimi coordination run. The guided Practice Lab deliberately uses rules-based simulation.

The website stays locally hosted. Live AI requests go from the local server to Kimi’s official Moonshot API. The key is never sent to browser code. People still confirm acceptance, pickup, and receipt. No email or SMS is sent. Organizations and pickup estimates remain fictional.

Never share `.env.local`. Source archives exclude environment files. The active provider is `moonshot`, configured through `MOONSHOT_API_KEY` and `KIMI_MODEL`. Earlier OpenAI credentials are not used by the active Kimi connection.

## Files

- `public/index.html`: page structure and supplied logo
- `public/style.css`: responsive design
- `public/app.js`: views and interactions
- `public/assets/second-serving-logo.png`: your original transparent PNG, unchanged
- `shared/engine.mjs`: matching and handoff rules
- `server/agent.mjs`: optional AI drafting and tool execution
- `local-server.mjs`: local website and API server
- `engine.test.mjs`, `agent.test.mjs`: verification

Run tests with:

```text
node --test engine.test.mjs agent.test.mjs
```

You can also run `npm test`. Automated provider tests use mock responses; a live model check is a separate operation.

The server listens only on `127.0.0.1`, so this is a same-computer website. Stop a terminal-launched server with Ctrl+C. If the assistant started the background server, use the saved process information in the chat workspace's `work/second-serving-local-process.json` to identify that process. Restart after changing server files; refresh after changing browser files.
