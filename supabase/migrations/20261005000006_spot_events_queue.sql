-- Queue primed with one message per newly inserted raw_spots row.
-- Message shape: {"spot_id": <bigint>, "source": "<text>"}
-- No consumer exists in Phase 1.

select pgmq.create('spot_events');
