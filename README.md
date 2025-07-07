# Sales Genius

This is a simple React/Express rewrite of the original Streamlit program described in `AGENTS.md`.

- Front‑end: `src/App.tsx` provides a chat interface.
- Back‑end: `server/index.ts` exposes an `/api/chat` endpoint and integrates with Azure OpenAI, Azure Search and Blob storage.

## Development

1. Place environment variables in a `.env` file as listed in `server/index.ts`.
2. Run `npm install` to install dependencies.
3. Build the TypeScript sources:
   ```bash
   npm run build
   ```
4. Start the server:
   ```bash
   npm start
   ```
5. Open `public/index.html` in your browser to use the chat UI.

## Docker

To build and run the application in Docker:

```bash
# build the image
docker build -t salesgenius .

# run the container
docker run --env-file .env -p 3001:3001 salesgenius
```

The server will be available on port `3001`.
