# Plan

Branch: `dev-test01`
Base commit: `b52288c2b7f07184a0ddc6fb9b096ea7cebde9d4`
Data: COCO 2017 val, 5000 images in one task, with `instances_val2017.json` imported as COCO 1.0.

What I found after the import: the json has 36,781 annotations, but Task #3 has 41,866 shapes. CVAT saves each piece of a multi-part COCO polygon as its own polygon shape (the pieces share a `group` number), and crowd regions become masks. Counting the json the same way gives 41,420 polygon pieces plus 446 crowd masks, which is exactly 41,866. So I check my counts against that number, not 36,781.

## Approach

I will add a new Django app at `cvat/apps/test` with one endpoint, `GET /api/analytics/labels?task_id=<id>`. It counts annotations per label inside PostgreSQL, using one `GROUP BY` query for each annotation table (`LabeledShape`, `LabeledTrack`, `LabeledImage`). Annotations reach their task through job, then segment, then task. For access control I will reuse CVAT's existing `TaskPermission` rules instead of writing a new OPA policy.

On the frontend I will add a page at `/tasks/:tid/label-analytics`, opened from the task's Actions menu. It draws a bar chart with Chart.js. Chart.js is already listed in `cvat-ui/package.json` but nothing uses it yet, so I don't need to add a dependency.

## Order and time (8 hours total)

| Step | What (Task.pdf item) | Hours | How I check it before committing |
|---|---|---|---|
| 1 | Plan, objectives and definition of done | 0-0.5 | Read through |
| 2 | Endpoint in the `test` app (item 1) | 0.5-1.5 | `manage.py check`, curl, and counts compared with `instances_val2017.json` |
| 3 | Login and task access (item 5) | 1.5-2.25 | Django tests in the container. Curl with no login should give 401, and a user without access should give 403 |
| 4 | Page, route and menu entry (item 2) | 2.25-3 | UI image builds and the page opens from Task #3 |
| 5 | Bar chart plus empty, error and loading states (items 3 and 4) | 3-3.75 | Try an empty task, a user without access, and the browser set to offline |
| 6 | Measure MO-1 (item 6) | 3.75-4.5 | 5 runs, raw output pasted into Objectives |
| 7 | Grouping by shape type (item 7) | 4.5-5.5 | Per-type counts compared with the COCO json |
| 8 | Live updates over WebSocket and reconnect (items 8 and 9) | 5.5-7 | See the note below |
| 9 | Decision record and definition of done with evidence | 7-7.5 | Every line has evidence next to it |

The last half hour (7.5-8) is kept free in case something takes longer than planned.

For item 7 I chose grouping by shape type. COCO imports give both polygons and masks (the crowd regions), so this grouping shows real differences in this dataset. It is also just one more column in the same `GROUP BY`.

## What I am skipping for now

These are not part of my main plan. If I am ahead of time once everything else above is done and tested, I will try them, but only then.

* Live updates over WebSocket and reconnecting (items 8 and 9). CVAT has no WebSocket setup today. The server runs on uvicorn but `channels` is not installed, so this needs a new dependency, ASGI routing, a Traefik route and a Redis channel layer. CVAT also saves annotations with `bulk_create`, which does not fire `post_save`, so there is no simple hook to send updates from. I will only start this if steps 1 to 7 are finished by about 5.5 hours in. If not, I will list it as not reached and say why.
* A global count across all tasks. Task.pdf asks for counts per task, and a global count would need its own visibility rules across organizations.
* Caching the counts in Redis. I will query PostgreSQL directly and only add a cache if MO-1 is missed because of the query.

## Changes to this plan

Filled in as I go: what changed, when, and why.

* Step 2: the task access check moved here from step 3. CVAT refuses to run any API view that has no `iam_permission_class`, so the endpoint needed one from the start, and I did not want a commit where any logged-in user could read any task's counts. Step 3 is now about proving it: a second user, Django tests, and the 401 and 403 curl outputs.
* Step 7: the plan only talked about grouping in the API. I also added a Total / By annotation type switch on the page, because the grouping is hard to see in raw JSON. The query change cost about 5 ms on MO-1 (72.5 ms before, 77.7 ms after), still under the target. Both measurements are in Objectives.
* Steps 8 and 9 (WebSocket and reconnect): I had listed these as skipped unless I was ahead of time. Step 7 was committed at 08:23, about 4.4 hours in, which was inside my 5.5 hour limit, so I tried them. I expected to need Django Channels, but looking at the server showed I did not: uvicorn already has the `websockets` library and CVAT's nginx already forwards WebSocket upgrades. So the change ended up much smaller than I planned for. How I built it, and what I gave up, is in the decision record below.

## What actually happened

I started at 04:00 (my time, UTC+5). Git shows commit times in UTC, so 23:18 UTC on 8 October is 04:18 here.

| Step | Planned (hours in) | Committed at (my time) | Hours in |
|---|---|---|---|
| 1. Plan, objectives, definition of done | 0-0.5 | 04:18 | 0.3 |
| 2. Endpoint | 0.5-1.5 | 04:54 | 0.9 |
| 3. Access tests | 1.5-2.25 | 05:55 | 1.9 |
| 4. Page and menu entry | 2.25-3 | 06:42 | 2.7 |
| 5. Chart, empty and error states | 3-3.75 | 07:43 | 3.7 |
| 6. MO-1 measurement | 3.75-4.5 | 07:53 | 3.9 |
| 7. Grouping by shape type | 4.5-5.5 | 08:23 | 4.4 |
| 8. WebSocket and reconnect | 5.5-7 | 09:35 | 5.6 |
| 9. Docs, evidence | 7-7.5 | this commit | about 6 |

Every step up to 7 finished at or ahead of its planned time, which is why I had room for steps 8 and 9. Setting up the stack and importing the 5000 images happened before 04:00 and is not counted, as Task.pdf allows.

## Decision record

Item 10, about the live updates (items 8 and 9), because that is where I had a real choice to make.

* **Approach taken:** a plain WebSocket at `/api/analytics/labels/ws`, handled in `cvat/apps/test/websocket.py` and routed in `cvat/asgi.py`. When it opens, it checks the login session, the same `TaskPermission` view rule as the HTTP endpoint, and the `Origin` header. Then every 2 seconds it reads the task's `updated_date`, which CVAT updates after every annotation create, update or delete (`_set_updated_date` in `dataset_manager/task.py`). When the date changes, it sends `annotations_changed` and the page reloads the counts through the normal endpoint. The socket never sends counts itself, so counting and permission checks stay in one place.
* **Approach rejected:** Django Channels, with a signal fired from CVAT's annotation save code and pushed to every open socket through a Redis channel layer. That would be instant, and it is the textbook way to do it.
* **What rejecting it cost:** updates arrive up to 2 seconds late instead of straight away, and every open analytics page costs one small query by primary key every 2 seconds, even when nothing changes. In return I added no new dependency, did not touch CVAT's annotation save path (which runs in several processes and containers, so a signal would have needed Redis to reach the socket anyway), and kept the change inside the `test` app plus 14 lines in `asgi.py`. If many people kept this page open at once, I would switch to the rejected approach.
