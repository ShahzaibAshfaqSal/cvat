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

Filled in after step 6 of the plan. Raw output is pasted as it came out.

| Run | time_total (ms) |
| :--- | :--- |
| 1 | |
| 2 | |
| 3 | |
| 4 | |
| 5 | |
| Median | |
| Spread (min to max) | |

EXPLAIN ANALYZE execution time:

Target met or missed, and why:

### Raw output

```text
```
