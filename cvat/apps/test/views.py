# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

from collections import Counter, defaultdict

from django.db.models import Count
from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.response import Response

from cvat.apps.engine.models import LabeledImage, LabeledShape, LabeledTrack
from cvat.apps.engine.types import ExtendedRequest

from .permissions import LabelAnalyticsPermission
from .serializers import LabelAnalyticsFilterSerializer, LabelAnalyticsSerializer


class LabelAnalyticsViewSet(viewsets.ViewSet):
    iam_supports_organization_params = False
    iam_permission_class = LabelAnalyticsPermission
    serializer_class = None

    @extend_schema(
        summary="Count annotations per label in a task, split by annotation type",
        parameters=[LabelAnalyticsFilterSerializer],
        responses={"200": LabelAnalyticsSerializer},
    )
    def list(self, request: ExtendedRequest):
        params = LabelAnalyticsFilterSerializer(data=request.query_params)
        params.is_valid(raise_exception=True)
        task_id = params.validated_data["task_id"]

        # Shapes, tracks and tags are stored in separate tables. Each row has a label
        # (Annotation.label -> engine.Label) and a job, which belongs to the task
        # through job -> segment -> task. Skeleton points are stored as child rows,
        # so only rows without a parent are counted.
        shapes = LabeledShape.objects.filter(job__segment__task_id=task_id, parent__isnull=True)
        tracks = LabeledTrack.objects.filter(job__segment__task_id=task_id, parent__isnull=True)
        tags = LabeledImage.objects.filter(job__segment__task_id=task_id)

        counts = defaultdict(Counter)
        # a shape has its own type (rectangle, polygon, mask...); group by label and type at once
        for row in shapes.values("label__name", "type").annotate(count=Count("id")).order_by():
            counts[row["label__name"]][row["type"]] += row["count"]

        # a track or a tag has no single shape type, so each kind is one group of its own
        for kind, queryset in (("track", tracks), ("tag", tags)):
            for row in queryset.values("label__name").annotate(count=Count("id")).order_by():
                counts[row["label__name"]][kind] += row["count"]

        results = sorted(
            (
                {"label": label, "count": by_type.total(), "by_type": dict(by_type)}
                for label, by_type in counts.items()
            ),
            key=lambda item: (-item["count"], item["label"]),
        )

        serializer = LabelAnalyticsSerializer(
            {
                "task_id": task_id,
                "total": sum(item["count"] for item in results),
                "results": results,
            }
        )
        return Response(serializer.data)
