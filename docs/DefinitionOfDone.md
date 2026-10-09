# Definition of Done

I wrote this before starting the code. At the end I tick each line and put a number, a commit or a test name next to it. A tick with nothing next to it doesn't count.

Final code: `60d3deee9`. Screenshots are in [docs/evidence](evidence/). Raw output for the checks is at the bottom of this file.

- [x] Endpoint returns counts per label for Task #3 that match `instances_val2017.json` once multi-part polygons are counted the way CVAT stores them (41,420 polygon pieces plus 446 crowd masks, 41,866 in total).
  **80 of 80 labels match**, total 41,866 (see "Counts against the COCO json" below). Endpoint added in `3e27b1f68`.
- [x] A request with no login is refused with 401, shown by a test and a curl output.
  `test_request_without_login_is_refused` and the curl output below (HTTP 401).
- [x] A request from a user without access to the task is refused with 403, shown by a test and a curl output.
  `test_user_without_access_to_task_is_refused`, the curl output below (HTTP 403 for user `viewer`), and [screenshot 03](evidence/03-no-access.png). `test_task_assignee_gets_counts` shows the same user gets 200 once CVAT's rules give them access, so the 403 comes from CVAT's task rule and not from a blanket block.
- [x] The page opens from Task #3 Actions menu and shows the counts as a bar chart.
  [Screenshot 01](evidence/01-chart-live.png): 41,866 annotations, 80 classes, chart. Menu entry in `88d3382ca`, chart in `dae72198b`.
- [x] A task with no annotations shows an empty message, not a blank chart.
  [Screenshot 02](evidence/02-empty-task.png), Task #4 with 3 images and no annotations.
- [ ] A failed request (403, server error, offline) shows an error with a Retry button that works.
  **Partly.** The 403 case is shown in [screenshot 03](evidence/03-no-access.png), with the Retry button. All failures go through the same error box (`describeError` in `label-analytics-page.tsx`), but I did not save evidence of the offline or server error cases, or of Retry bringing the chart back.
- [x] MO-1 measured 5 times, with median, spread and raw output in `Objectives.md`.
  Median 72.5 ms, spread 71.0 to 73.0 ms on `dae72198b`. Measured again after steps 7 and 8: 77.7 ms and 78.5 ms.
- [x] MO-1 target met, or missed with the reason written down.
  Met every time against the 100 ms target. Where the time goes and what would make it miss is written in `Objectives.md`.
- [x] Grouping by shape type works and its counts match the COCO json.
  `21726bebd`. Every label's polygon and mask counts match the json (polygon 41,420, mask 446). `test_owner_gets_counts_per_label` checks rectangle, polygon, skeleton, track and tag groups.
- [x] Items 8 and 9 done, or listed below as not reached with the reason.
  Done in `60d3deee9`. [Screenshot 04](evidence/04-live-update.png): Task #4 went from empty to 1 annotation after I saved a box in another tab, with no reload. [Screenshot 05](evidence/05-reconnecting.png): "Reconnecting..." after `docker restart cvat_server`; it went back to "Live" by itself. Three WebSocket tests and the end-to-end output below.
- [x] Decision record written in `Plan.md`.
  About the live updates: plain WebSocket checking `updated_date` every 2 s, against Django Channels with a save signal.
- [x] No dead code, commented-out blocks or stray files in the diff.
  `git diff b52288c2b HEAD`: 21 files, all part of the feature or these docs. I searched the added lines for `console.log`, `print(`, `TODO`, `FIXME` and commented-out code and found none.

## Not finished

* Evidence for the offline and server error cases, and for Retry recovering, as said above. The code path is the same as the 403 case, but I did not capture it.
* I did not test tasks that belong to an organization. All my tasks are in the personal workspace. The endpoint and the socket both use CVAT's own permission code, so I expect it to work, but I have not seen it.
* The Django tests ran inside the production server image with its normal settings, not with `cvat.settings.testing`, because that needs dev packages (`django_extensions`) the image does not have. They still use a throwaway test database.
* I did not regenerate CVAT's OpenAPI file `cvat/schema.yml`, so CVAT's own schema check would complain about the new endpoint.
* Something I would change: the query groups by label name, which is text, and about 15 ms of it is sorting 41,866 rows by name. Grouping by `label_id` and looking up the 80 names afterwards should be cheaper. I left it because the target was met.
* Live updates check for changes every 2 seconds instead of being pushed the moment an annotation is saved. This was a choice, explained in the decision record in `Plan.md`.

## Raw output

### Counts against the COCO json

Each label's count from the API compared with the json, counting each polygon piece and each crowd region the way CVAT stores them.

```text
labels 80 total 41866 types {'mask': 446, 'polygon': 41420} mismatches: none
```

### Django tests (`python manage.py test cvat.apps.test`, inside `cvat_server`)

```text
test_invalid_task_id_is_rejected ... ok
test_owner_gets_counts_per_label ... ok
test_request_without_login_is_refused ... ok
test_task_assignee_gets_counts ... ok
test_unknown_task_is_not_found ... ok
test_user_without_access_to_task_is_refused ... ok
test_socket_for_task_owner_is_ready ... ok
test_socket_without_access_is_closed ... ok
test_socket_without_login_is_closed ... ok
Ran 9 tests in 3.032s
OK
```

### Login and access on the live server

Run on 9 October 2026 (UTC) against Task #3, with real API tokens replaced by placeholders.

```text
$ curl -s -w "\nHTTP %{http_code}\n" "http://localhost:8080/api/analytics/labels?task_id=3"
{"detail":"Authentication credentials were not provided."}
HTTP 401
$ curl -s -w "\nHTTP %{http_code}\n" -H "Authorization: Token <viewer token>" "http://localhost:8080/api/analytics/labels?task_id=3"
{"detail":"You do not have permission to perform this action."}
HTTP 403
$ curl -s -w "\nHTTP %{http_code}\n" -H "Authorization: Token <admin token>" "http://localhost:8080/api/analytics/labels?task_id=3" | cut -c1-120
{"task_id":3,"total":41866,"results":[{"label":"person","count":12451},{"label":"car","count":2315},{"label":"chair","co
HTTP 200
```

### WebSocket end to end, through Traefik on localhost:8080

A Python WebSocket client connected the same way the browser does. Close codes: 4401 no login, 4403 no access or a page from another site, 4400 bad request, 4404 no such task.

```text
no login, task 4            -> 4401
viewer, task 3 (no access)  -> 4403
admin, missing task_id      -> 4400
admin, task 999999          -> 4404
admin, foreign Origin       -> 4403
admin, task 4               -> message {"type": "ready", "task_id": 4}
on connect: {"type": "ready", "task_id": 4}
counts before: {'task_id': 4, 'total': 0, 'results': []}
after create: message {"type": "annotations_changed", "task_id": 4} after 2.0s; counts now: {'task_id': 4, 'total': 1, 'results': [{'label': 'person', 'count': 1, 'by_type': {'rectangle': 1}}]}
after delete: message {"type": "annotations_changed", "task_id": 4} after 2.0s; counts now: {'task_id': 4, 'total': 0, 'results': []}
no further messages while nothing changes: ok
```

Connection drop: I opened a socket, ran `docker restart cvat_server`, and reconnected.

```text
connected: {"type": "ready", "task_id": 4}
connection dropped, close code: 1012
reconnected after 22s: {"type": "ready", "task_id": 4}
```
