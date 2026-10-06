import { assertEquals } from "@std/assert";
import { ingestHandler } from "../serve.ts";
import type { IngestDb, SourceAdapter } from "../types.ts";

function adapter(feed: unknown): SourceAdapter {
  return {
    source: "sotawatch",
    fetchSpots: () => Promise.resolve(feed),
    parseFeed: (body) => body as [],
    normalize: () => Promise.resolve({ kind: "skip", reason: "too_old" }),
  };
}

const db: IngestDb = {
  getLastEpoch: () => Promise.resolve(null),
  ingestSpots: () => Promise.resolve([]),
  recordSpotFailures: () => Promise.resolve(),
  recordSuccess: () => Promise.resolve(),
  recordFailure: () => Promise.resolve(),
  matchPendingSpots: () => Promise.resolve(0),
};

Deno.test("ingestHandler returns the run summary as JSON", async () => {
  const res = await ingestHandler(adapter([]), () => db)(new Request("http://x/"));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.source, "sotawatch");
  assertEquals(body.fetched, 0);
});

Deno.test("ingestHandler turns a thrown error into a 500 naming the source", async () => {
  const res = await ingestHandler(adapter([]), () => {
    throw new Error("missing environment variable SUPABASE_URL");
  })(new Request("http://x/"));
  assertEquals(res.status, 500);
  assertEquals(await res.json(), {
    source: "sotawatch",
    error: "missing environment variable SUPABASE_URL",
  });
});

Deno.test("ingestHandler stringifies non-Error throws", async () => {
  const res = await ingestHandler(adapter([]), () => {
    throw "plain string";
  })(new Request("http://x/"));
  assertEquals((await res.json()).error, "plain string");
});
