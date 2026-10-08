# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

from django.urls import include, path
from rest_framework import routers

from cvat.apps.test import views

router = routers.DefaultRouter(trailing_slash=False)
router.register("labels", views.LabelAnalyticsViewSet, basename="analytics_labels")

urlpatterns = [
    path("analytics/", include(router.urls)),
]
