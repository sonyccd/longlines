// HTTP shell shared by the ingest functions: run the orchestrator, return the
// summary as JSON, or a 500 whose body and log line carry the error.

import { createIngestDb, createServiceClient } from "./db.ts";
import { runIngest } from "./ingest.ts";
import type { IngestDb, SourceAdapter } from "./types.ts";

export function ingestHandler(
  adapter: SourceAdapter,
  makeDb: () => IngestDb,
): (req: Request) => Promise<Response> {
  return async (_req: Request): Promise<Response> => {
    try {
      const summary = await runIngest(adapter, makeDb());
      console.log(JSON.stringify(summary));
      return Response.json(summary);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`ingest-${adapter.source} failed: ${message}`);
      return Response.json({ source: adapter.source, error: message }, { status: 500 });
    }
  };
}

export function serveIngest(adapter: SourceAdapter): void {
  Deno.serve(ingestHandler(adapter, () => createIngestDb(createServiceClient())));
}
