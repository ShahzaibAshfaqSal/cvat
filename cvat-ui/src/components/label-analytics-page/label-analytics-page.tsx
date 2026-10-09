// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import './styles.scss';

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Row, Col } from 'antd/lib/grid';
import Alert from 'antd/lib/alert';
import Button from 'antd/lib/button';
import Card from 'antd/lib/card';
import Empty from 'antd/lib/empty';
import Statistic from 'antd/lib/statistic';
import Text from 'antd/lib/typography/Text';
import Title from 'antd/lib/typography/Title';

import { getCore, ServerError, Task } from 'cvat-core-wrapper';
import GoBackButton from 'components/common/go-back-button';
import CVATLoadingSpinner from 'components/common/loading-spinner';
import LabelCountsChart, { LabelAnnotationCount } from './label-counts-chart';

const core = getCore();

interface LabelAnalytics {
    task_id: number;
    total: number;
    results: LabelAnnotationCount[];
}

interface PageData {
    task: Task;
    analytics: LabelAnalytics;
}

function describeError(error: unknown): string {
    if (error instanceof ServerError) {
        switch (error.code) {
            case 401:
                return 'Your session has expired. Please log in again.';
            case 403:
                return 'You do not have access to this task.';
            case 404:
                return 'This task does not exist.';
            default:
                return error.message;
        }
    }

    return error instanceof Error ? error.message : 'Unknown error';
}

function LabelAnalyticsPage(): JSX.Element {
    const { tid } = useParams<{ tid: string }>();
    const taskId = +tid;
    const [data, setData] = useState<PageData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setData(null);
        setError(null);

        Promise.all([
            core.tasks.get({ id: taskId }),
            core.server.request<{ data: LabelAnalytics }>(`${core.config.backendAPI}/analytics/labels`, {
                method: 'GET',
                params: { task_id: taskId },
            }),
        ]).then(([[task], response]) => {
            if (cancelled) {
                return;
            }

            if (task) {
                setData({ task, analytics: response.data });
            } else {
                setError('This task does not exist.');
            }
        }).catch((_error: unknown) => {
            if (!cancelled) {
                setError(describeError(_error));
            }
        });

        return () => {
            cancelled = true;
        };
    }, [taskId, attempt]);

    let content: JSX.Element;
    if (error) {
        content = (
            <Alert
                className='cvat-label-analytics-error'
                type='error'
                showIcon
                message='Could not load annotation counts'
                description={error}
                action={<Button onClick={() => setAttempt(attempt + 1)}>Retry</Button>}
            />
        );
    } else if (!data) {
        content = <CVATLoadingSpinner size='large' />;
    } else if (data.analytics.total === 0) {
        content = <Empty className='cvat-label-analytics-empty' description='No annotations found for this task' />;
    } else {
        const { task, analytics } = data;
        const labelColors = Object.fromEntries(
            task.labels.filter((label) => label.color).map((label) => [label.name, label.color as string]),
        );

        content = (
            <>
                <Row gutter={16} className='cvat-label-analytics-summary'>
                    <Col span={8}>
                        <Statistic title='Total annotations' value={analytics.total} />
                    </Col>
                    <Col span={8}>
                        <Statistic title='Classes with annotations' value={analytics.results.length} />
                    </Col>
                    <Col span={8}>
                        <Statistic title='Most frequent class' value={analytics.results[0].label} />
                    </Col>
                </Row>
                <LabelCountsChart counts={analytics.results} labelColors={labelColors} />
            </>
        );
    }

    return (
        <div className='cvat-label-analytics-page'>
            <Row justify='center'>
                <Col span={22} xl={18} xxl={14}>
                    <GoBackButton />
                </Col>
            </Row>
            <Row justify='center'>
                <Col span={22} xl={18} xxl={14}>
                    <Card>
                        <Title level={4}>Annotations per class</Title>
                        <Text type='secondary'>
                            {data ? `Task #${taskId}: ${data.task.name}` : `Task #${taskId}`}
                        </Text>
                        <div className='cvat-label-analytics-content'>{content}</div>
                    </Card>
                </Col>
            </Row>
        </div>
    );
}

export default React.memo(LabelAnalyticsPage);
