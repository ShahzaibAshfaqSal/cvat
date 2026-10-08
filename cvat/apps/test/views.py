# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

from collections import Counter

from django.db.models import Count
from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.response import Response

from cvat.apps.engine.models import LabeledImage, LabeledShape, LabeledTrack
from cvat.apps.engine.types import ExtendedRequest

from .permissions import LabelAnalyticsPermission
from .serializers import LabelAnalyticsFilterSerializer, LabelAnalyticsSerializer

# Shapes, tracks and tags are stored in separate tables. Each row has a label
# (Annotation.label -> engine.Label) and a job, which belongs to the task
# through job -> segment -> task.
ANNOTATION_MODELS = (LabeledShape, LabeledTrack, LabeledImage)


class LabelAnalyticsViewSet(viewsets.ViewSet):
    iam_supports_organization_params = False
    iam_permission_class = LabelAnalyticsPermission
    serializer_class = None

    @extend_schema(
        summary="Count annotations per label in a task",
        parameters=[LabelAnalyticsFilterSerializer],
        responses={"200": LabelAnalyticsSerializer},
    )
    def list(self, request: ExtendedRequest):
        params = LabelAnalyticsFilterSerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        task_id = params.validated_data["task_id"]

        counts = Counter()
        for model in ANNOTATION_MODELS:
            queryset = model.objects.filter(job__segment__task_id=task_id)
            if hasattr(model, "parent"):
                # skeleton points are stored as child rows; count the skeleton once
                queryset = queryset.filter(parent__isnull=True)

            rows = queryset.values("label__name").annotate(count=Count("id")).order_by()
            for row in rows:
                counts[row["label__name"]] += row["count"]

        results = [
            {"label": label, "count": count}
            for label, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
        ]

        serializer = LabelAnalyticsSerializer(
            {"task_id": task_id, "total": counts.total(), "results": results}
        )
        return Response(serializer.data)
