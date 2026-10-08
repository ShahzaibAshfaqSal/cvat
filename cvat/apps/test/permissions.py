# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

from rest_framework.exceptions import NotFound

from cvat.apps.engine.models import Task
from cvat.apps.engine.permissions import TaskPermission

from .serializers import LabelAnalyticsFilterSerializer


class LabelAnalyticsPermission:
    """
    Reuses the engine's task rules instead of adding new OPA rules:
    counting the annotations of a task needs "view" access to that task.
    """

    @classmethod
    def create(cls, request, view, obj, iam_context):
        params = LabelAnalyticsFilterSerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        task_id = params.validated_data["task_id"]

        try:
            task = Task.objects.select_related("organization").get(id=task_id)
        except Task.DoesNotExist:
            raise NotFound(f"Task {task_id} does not exist")

        return [TaskPermission.create_scope_view(request, task)]
