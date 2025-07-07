# Sales Genius

This is a simple React/Express rewrite of the original Streamlit program described in `AGENTS.md`.

- Front‑end: `src/App.tsx` provides a chat interface.
- Back‑end: `server/index.ts` exposes an `/api/chat` endpoint and integrates with Azure OpenAI, Azure Search and Blob storage.

## Development

1. Place environment variables in a `.env` file as listed in `server/index.ts`.
2. Run `npm install` to install dependencies.
