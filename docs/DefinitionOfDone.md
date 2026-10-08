# Definition of Done

I wrote this before starting the code. At the end I tick each line and put a number, a commit or a test name next to it. A tick with nothing next to it doesn't count.

- [ ] Endpoint returns counts per label for Task #3 that match `instances_val2017.json` once multi-part polygons are counted the way CVAT stores them (41,420 polygon pieces plus 446 crowd masks, 41,866 in total).
- [ ] A request with no login is refused with 401, shown by a test and a curl output.
- [ ] A request from a user without access to the task is refused with 403, shown by a test and a curl output.
- [ ] The page opens from Task #3 Actions menu and shows the counts as a bar chart.
- [ ] A task with no annotations shows an empty message, not a blank chart.
- [ ] A failed request (403, server error, offline) shows an error with a Retry button that works.
- [ ] MO-1 measured 5 times, with median, spread and raw output in `Objectives.md`.
- [ ] MO-1 target met, or missed with the reason written down.
- [ ] Grouping by shape type works and its counts match the COCO json.
- [ ] Items 8 and 9 done, or listed below as not reached with the reason.
- [ ] Decision record written in `Plan.md`.
- [ ] No dead code, commented-out blocks or stray files in the diff.

## Not finished

Filled in at the end.
