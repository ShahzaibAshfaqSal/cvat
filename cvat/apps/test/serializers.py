# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

from rest_framework import serializers


class LabelAnalyticsFilterSerializer(serializers.Serializer):
    task_id = serializers.IntegerField(min_value=1)


class LabelAnnotationCountSerializer(serializers.Serializer):
    label = serializers.CharField()
    count = serializers.IntegerField()


class LabelAnalyticsSerializer(serializers.Serializer):
    task_id = serializers.IntegerField()
    total = serializers.IntegerField()
    results = LabelAnnotationCountSerializer(many=True)
