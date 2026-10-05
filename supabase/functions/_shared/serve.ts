// HTTP shell shared by the ingest functions: run the orchestrator, return the
// summary as JSON, or a 500 whose body and log line carry the error.

import { createIngestDb, createServiceClient } from "./db.ts";
import { runIngest } from "./ingest.ts";
import type { SourceAdapter } from "./types.ts";

export function serveIngest(adapter: SourceAdapter): void {
  Deno.serve(async (_req: Request): Promise<Response> => {
    try {
      const db = createIngestDb(createServiceClient());
      const summary = await runIngest(adapter, db);
      console.log(JSON.stringify(summary));
      return Response.json(summary);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`ingest-${adapter.source} failed: ${message}`);
      return Response.json({ source: adapter.source, error: message }, { status: 500 });
    }
  });
}
