# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

from rest_framework import status
from rest_framework.test import APITestCase

from cvat.apps.engine.models import (
    Data,
    Job,
    Label,
    LabeledImage,
    LabeledShape,
    LabeledTrack,
    Segment,
    ShapeType,
    Task,
    TrackedShape,
)
from cvat.apps.engine.tests.utils import ForceLogin
from cvat.apps.iam.models import User

URL = "/api/analytics/labels"


class LabelAnalyticsAPITestCase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user(username="owner", password="owner")
        cls.stranger = User.objects.create_user(username="stranger", password="stranger")

        cls.task = Task.objects.create(
            name="analytics task",
            owner=cls.owner,
            data=Data.objects.create(size=10, stop_frame=9, image_quality=50),
        )
        job = Job.objects.create(
            segment=Segment.objects.create(task=cls.task, start_frame=0, stop_frame=9)
        )
        car = Label.objects.create(task=cls.task, name="car")
        person = Label.objects.create(task=cls.task, name="person")
        head = Label.objects.create(task=cls.task, name="head", parent=person)

        # car: 2 shapes + 1 track = 3
        LabeledShape.objects.create(job=job, label=car, frame=0, type=ShapeType.RECTANGLE)
        LabeledShape.objects.create(job=job, label=car, frame=1, type=ShapeType.POLYGON)
        track = LabeledTrack.objects.create(job=job, label=car, frame=0)
        for frame in (0, 5):
            TrackedShape.objects.create(track=track, frame=frame, type=ShapeType.RECTANGLE)

        # person: 1 skeleton shape + 1 tag = 2; the skeleton's child point is not counted
        skeleton = LabeledShape.objects.create(
            job=job, label=person, frame=2, type=ShapeType.SKELETON
        )
        LabeledShape.objects.create(
            job=job, label=head, frame=2, type=ShapeType.POINTS, parent=skeleton
        )
        LabeledImage.objects.create(job=job, label=person, frame=3)

    def _get(self, user, params):
        if user is None:
            return self.client.get(URL, params)

        with ForceLogin(user, self.client):
            return self.client.get(URL, params)

    def test_owner_gets_counts_per_label(self):
        response = self._get(self.owner, {"task_id": self.task.id})

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(
            response.data,
            {
                "task_id": self.task.id,
                "total": 5,
                "results": [
                    {
                        "label": "car",
                        "count": 3,
                        "by_type": {"rectangle": 1, "polygon": 1, "track": 1},
                    },
                    {
                        "label": "person",
                        "count": 2,
                        "by_type": {"skeleton": 1, "tag": 1},
                    },
                ],
            },
        )

    def test_request_without_login_is_refused(self):
        response = self._get(None, {"task_id": self.task.id})

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_user_without_access_to_task_is_refused(self):
        response = self._get(self.stranger, {"task_id": self.task.id})

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_task_assignee_gets_counts(self):
        self.task.assignee = self.stranger
        self.task.save()

        response = self._get(self.stranger, {"task_id": self.task.id})

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(response.data["total"], 5)

    def test_unknown_task_is_not_found(self):
        response = self._get(self.owner, {"task_id": self.task.id + 1000})

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_invalid_task_id_is_rejected(self):
        for params in ({}, {"task_id": "abc"}, {"task_id": 0}):
            with self.subTest(params=params):
                response = self._get(self.owner, params)

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
