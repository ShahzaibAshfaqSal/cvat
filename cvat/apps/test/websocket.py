# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

"""
WebSocket that tells the label analytics page when a task's annotations change.

CVAT calls Task.touch() after every annotation create, update or delete
(see dataset_manager.task.JobAnnotation._set_updated_date), so a change in
Task.updated_date means the counts may have changed. The socket only sends a
notification; the page then reloads the counts through the HTTP endpoint, so
counting and permission checks stay in one place.
"""

import asyncio
import json
from importlib import import_module
from urllib.parse import parse_qs, urlsplit

from asgiref.sync import sync_to_async
from django.conf import settings
from django.contrib.auth import get_user
from django.http import HttpRequest
from django.http.cookie import parse_cookie

from cvat.apps.engine.models import Task
from cvat.apps.engine.permissions import TaskPermission
from cvat.apps.iam.middleware import get_organization

PATH = "/api/analytics/labels/ws"
POLL_INTERVAL_SECONDS = 2

# application-defined close codes, so the page knows not to reconnect
CLOSE_BAD_REQUEST = 4400
CLOSE_NOT_AUTHENTICATED = 4401
CLOSE_FORBIDDEN = 4403
CLOSE_NOT_FOUND = 4404


def _check_access(scope) -> tuple[int | None, int | None]:
    """Returns (task_id, None) if the user may view the task, else (None, close code)."""
    headers = {key.decode("latin1"): value.decode("latin1") for key, value in scope["headers"]}

    # Browsers always send Origin on WebSocket connections and do not apply CORS to them,
    # so refuse sockets opened by pages from other sites (cross-site WebSocket hijacking).
    origin = headers.get("origin")
    if origin and urlsplit(origin).netloc != headers.get("host"):
        return None, CLOSE_FORBIDDEN

    try:
        task_id = int(parse_qs(scope["query_string"].decode())["task_id"][0])
    except (KeyError, ValueError):
        return None, CLOSE_BAD_REQUEST

    # Build the parts of a request that Django's session auth and CVAT's IAM code read.
    request = HttpRequest()
    request.META = {
        "HTTP_" + key.upper().replace("-", "_"): value for key, value in headers.items()
    }
    request.COOKIES = parse_cookie(headers.get("cookie", ""))
    session_store = import_module(settings.SESSION_ENGINE).SessionStore
    request.session = session_store(request.COOKIES.get(settings.SESSION_COOKIE_NAME))
    request.user = get_user(request)
    if not request.user.is_authenticated:
        return None, CLOSE_NOT_AUTHENTICATED

    request.iam_context = get_organization(request)

    try:
        task = Task.objects.select_related("organization").get(id=task_id)
    except Task.DoesNotExist:
        return None, CLOSE_NOT_FOUND

    # the same "view task" rule that the HTTP endpoint uses
    if not TaskPermission.create_scope_view(request, task).check_access().allow:
        return None, CLOSE_FORBIDDEN

    return task_id, None


def _get_updated_date(task_id: int):
    return Task.objects.filter(id=task_id).values_list("updated_date", flat=True).first()


async def _wait_for_disconnect(receive, timeout: float) -> bool:
    try:
        message = await asyncio.wait_for(receive(), timeout)
    except asyncio.TimeoutError:
        return False

    return message["type"] == "websocket.disconnect"


async def label_counts_socket(scope, receive, send):
    if (await receive())["type"] != "websocket.connect":
        return

    # accept first, so that a refusal reaches the page as a close code it can read
    await send({"type": "websocket.accept"})

    task_id, close_code = await sync_to_async(_check_access)(scope)
    if close_code:
        await send({"type": "websocket.close", "code": close_code})
        return

    last_updated_date = await sync_to_async(_get_updated_date)(task_id)
    await send({"type": "websocket.send", "text": json.dumps({"type": "ready", "task_id": task_id})})

    while not await _wait_for_disconnect(receive, POLL_INTERVAL_SECONDS):
        updated_date = await sync_to_async(_get_updated_date)(task_id)
        if updated_date is None:
            await send({"type": "websocket.close", "code": CLOSE_NOT_FOUND})
            return

        if updated_date != last_updated_date:
            last_updated_date = updated_date
            await send(
                {
                    "type": "websocket.send",
                    "text": json.dumps({"type": "annotations_changed", "task_id": task_id}),
                }
            )
