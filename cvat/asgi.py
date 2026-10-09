# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

"""
ASGI config for CVAT project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/3.2/howto/deployment/asgi/
"""

import os

from django.apps import apps
from django.core.asgi import get_asgi_application
from django.core.handlers.asgi import ASGIHandler

import cvat.utils.remote_debugger as debug

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "cvat.settings.development")

application = get_asgi_application()


if debug.is_debugging_enabled():

    class DebuggerApp(ASGIHandler):
        """
        Support for VS code debugger
        """

        def __init__(self) -> None:
            super().__init__()
            self.__debugger = debug.RemoteDebugger()

        async def handle(self, *args, **kwargs):
            self.__debugger.attach_current_thread()
            return await super().handle(*args, **kwargs)

    application = DebuggerApp()


if apps.is_installed("cvat.apps.test"):
    from cvat.apps.test import websocket as label_counts_websocket

    http_application = application

    async def application(scope, receive, send):
        # Django's ASGI handler only serves HTTP, so the analytics socket is routed here
        if scope["type"] == "websocket" and scope["path"] == label_counts_websocket.PATH:
            return await label_counts_websocket.label_counts_socket(scope, receive, send)

        return await http_application(scope, receive, send)
