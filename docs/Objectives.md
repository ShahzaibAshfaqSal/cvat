# Objectives

## Environment

* OS: Ubuntu 24.04.4 LTS (Azure VM)
* CPU: Intel Xeon Platinum 8272CL @ 2.60 GHz, 4 vCPUs
* RAM: 16 GB (15 GiB usable)
* CVAT base commit: `b52288c2b7f07184a0ddc6fb9b096ea7cebde9d4`
* Data: COCO 2017 val, 5000 images in Task #3, `instances_val2017.json` imported as COCO 1.0

## MO-1: endpoint response time

| Field | Entry |
| :--- | :--- |
| What is measured | Total time for `GET /api/analytics/labels?task_id=3`, from sending the request until the full JSON response arrives. |
| How | `curl -s -o /dev/null -w "%{time_total}\n"` from the VM, through Traefik on `localhost:8080`, run 5 times in a row. I will also run `EXPLAIN ANALYZE` on the counting SQL in `cvat_db`, so I can see how much of the time is the database and how much is the permission check and HTTP. |
| Target | Median of 5 runs at or below 100 ms. |
| Why this number | I want the chart on screen within about 300 ms of opening the page. In that time the page also loads the task and draws the chart, so I give the counts API at most a third of it. I measure on the full 5000 image task, not a small sample, so the target only holds if the counting really happens in the database. |
| Conditions | Local Docker Compose stack, images built from this branch, nothing else running on the VM. Requests use an API token (`Authorization: Token ...`). I don't use Basic auth because it hashes the password again on every request, and that would hide the query time. |
| Not included | One warm-up request sent before the 5 measured runs, which I throw away. Frontend rendering time. Any task other than Task #3. |

## Results

Measured on 9 October 2026 at 02:45 UTC, on commit `dae72198b` (all code up to the chart page). Machine load average was 0.3. Apart from the CVAT stack, the only other process using CPU was the VS Code server I was working through.

| Run | time_total (ms) |
| :--- | :--- |
| 1 | 71.0 |
| 2 | 72.5 |
| 3 | 73.0 |
| 4 | 72.4 |
| 5 | 72.6 |
| Median | 72.5 |
| Spread (min to max) | 71.0 to 73.0 (1.9 ms) |

EXPLAIN ANALYZE, 5 runs of each counting query, median execution time:

| Query | Median (ms) |
| :--- | :--- |
| LabeledShape (41,866 rows) | 41.7 |
| LabeledTrack (no rows in this task) | 0.17 |
| LabeledImage (no rows in this task) | 0.15 |

Target met: the median is 72.5 ms against a target of 100 ms.

Where the time goes: about 42 ms of the 72.5 ms is the database, almost all of it the shapes query. The other 30 ms or so is everything around it: the token lookup, the permission check (an HTTP call from Django to the OPA container), DRF, JSON and Traefik. I did not time those parts one by one, so 30 ms is the remainder, not a measured number.

What I learned from the plan:

* Inside the shapes query, about 15 ms is sorting all 41,866 rows by label name before grouping them. Grouping by `label_id` (an integer) and looking the 80 names up afterwards would probably make that sort cheaper. I did not change it because the target was already met, and I did not want to change working code without a reason.
* PostgreSQL estimated 171 rows where there are 41,866, so its statistics are out of date after the bulk COCO import. Running `ANALYZE` on the annotation tables would fix the estimate. It did not cause a bad plan here, since it still used the indexes on `segment.task_id` and `labeledshape.job_id`.
* The cost grows with the number of shapes in the task, roughly 1 ms per 1,000 shapes for the database part. A task about twice this size would likely miss the 100 ms target.

To be honest about the target: it held on the first measurement. Nothing was tuned to reach it, because counting with `GROUP BY` in the database was the plan from the start.

### Raw output

Endpoint timing (token replaced with a placeholder):

```text
$ date -u; git rev-parse --short HEAD
Fri Oct  9 02:45:05 UTC 2026
dae72198b
$ curl -s -o /dev/null -w 'warm-up: HTTP %{http_code} %{time_total}s\n' -H 'Authorization: Token <admin token>' 'http://localhost:8080/api/analytics/labels?task_id=3'
warm-up: HTTP 200 0.072717s
$ for i in 1 2 3 4 5; do curl -s -o /dev/null -w "run $i: HTTP %{http_code} %{time_total}s\n" -H 'Authorization: Token <admin token>' 'http://localhost:8080/api/analytics/labels?task_id=3'; done
run 1: HTTP 200 0.071035s
run 2: HTTP 200 0.072486s
run 3: HTTP 200 0.072968s
run 4: HTTP 200 0.072387s
run 5: HTTP 200 0.072624s
```

EXPLAIN ANALYZE (run from `manage.py shell` inside `cvat_server`, using the exact SQL Django generates for the endpoint):

```text
== LabeledShape
SQL: SELECT "engine_label"."name" AS "label__name", COUNT("engine_labeledshape"."id") AS "count" FROM "engine_labeledshape" INNER JOIN "engine_job" ON ("engine_labeledshape"."job_id" = "engine_job"."id") INNER JOIN "engine_segment" ON ("engine_job"."segment_id" = "engine_segment"."id") INNER JOIN "engine_label" ON ("engine_labeledshape"."label_id" = "engine_label"."id") WHERE ("engine_segment"."task_id" = 3 AND "engine_labeledshape"."parent_id" IS NULL) GROUP BY 1
execution ms, 5 runs: [43.924, 42.39, 41.65, 41.47, 41.521] median: 41.65
GroupAggregate  (cost=1225.75..1227.84 rows=80 width=15) (actual time=34.782..41.118 rows=80 loops=1)
  Group Key: engine_label.name
  ->  Sort  (cost=1225.75..1226.18 rows=171 width=15) (actual time=34.749..36.760 rows=41866 loops=1)
        Sort Key: engine_label.name
        Sort Method: quicksort  Memory: 3558kB
        ->  Hash Join  (cost=12.62..1219.41 rows=171 width=15) (actual time=0.090..21.813 rows=41866 loops=1)
              Hash Cond: (engine_labeledshape.label_id = engine_label.id)
              ->  Nested Loop  (cost=9.82..1216.14 rows=171 width=12) (actual time=0.048..15.895 rows=41866 loops=1)
                    ->  Hash Join  (cost=9.53..22.05 rows=1 width=4) (actual time=0.026..0.032 rows=1 loops=1)
                          Hash Cond: (engine_job.segment_id = engine_segment.id)
                          ->  Seq Scan on engine_job  (cost=0.00..12.00 rows=200 width=8) (actual time=0.003..0.005 rows=2 loops=1)
                          ->  Hash  (cost=9.50..9.50 rows=2 width=4) (actual time=0.013..0.015 rows=1 loops=1)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                ->  Bitmap Heap Scan on engine_segment  (cost=4.16..9.50 rows=2 width=4) (actual time=0.007..0.008 rows=1 loops=1)
                                      Recheck Cond: (task_id = 3)
                                      Heap Blocks: exact=1
                                      ->  Bitmap Index Scan on engine_segment_task_id_37d935cf  (cost=0.00..4.16 rows=2 width=0) (actual time=0.003..0.004 rows=1 loops=1)
                                            Index Cond: (task_id = 3)
                    ->  Index Scan using engine_labeledshape_job_id_b7694c3a on engine_labeledshape  (cost=0.29..775.42 rows=41866 width=16) (actual time=0.020..12.756 rows=41866 loops=1)
                          Index Cond: (job_id = engine_job.id)
                          Filter: (parent_id IS NULL)
              ->  Hash  (cost=1.80..1.80 rows=80 width=11) (actual time=0.033..0.033 rows=82 loops=1)
                    Buckets: 1024  Batches: 1  Memory Usage: 12kB
                    ->  Seq Scan on engine_label  (cost=0.00..1.80 rows=80 width=11) (actual time=0.006..0.013 rows=82 loops=1)
Planning Time: 0.390 ms
Execution Time: 41.521 ms
== LabeledTrack
SQL: SELECT "engine_label"."name" AS "label__name", COUNT("engine_labeledtrack"."id") AS "count" FROM "engine_labeledtrack" INNER JOIN "engine_job" ON ("engine_labeledtrack"."job_id" = "engine_job"."id") INNER JOIN "engine_segment" ON ("engine_job"."segment_id" = "engine_segment"."id") INNER JOIN "engine_label" ON ("engine_labeledtrack"."label_id" = "engine_label"."id") WHERE ("engine_segment"."task_id" = 3 AND "engine_labeledtrack"."parent_id" IS NULL) GROUP BY 1
execution ms, 5 runs: [0.193, 0.167, 0.164, 0.159, 0.184] median: 0.167
== LabeledImage
SQL: SELECT "engine_label"."name" AS "label__name", COUNT("engine_labeledimage"."id") AS "count" FROM "engine_labeledimage" INNER JOIN "engine_job" ON ("engine_labeledimage"."job_id" = "engine_job"."id") INNER JOIN "engine_segment" ON ("engine_job"."segment_id" = "engine_segment"."id") INNER JOIN "engine_label" ON ("engine_labeledimage"."label_id" = "engine_label"."id") WHERE "engine_segment"."task_id" = 3 GROUP BY 1
execution ms, 5 runs: [0.131, 0.152, 0.16, 0.145, 0.179] median: 0.152
```
