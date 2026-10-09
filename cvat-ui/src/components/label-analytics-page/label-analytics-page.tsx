// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import './styles.scss';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Row, Col } from 'antd/lib/grid';
import Alert from 'antd/lib/alert';
import Button from 'antd/lib/button';
import Card from 'antd/lib/card';
import Empty from 'antd/lib/empty';
import Radio from 'antd/lib/radio';
import Statistic from 'antd/lib/statistic';
import Tag from 'antd/lib/tag';
import Text from 'antd/lib/typography/Text';
import Title from 'antd/lib/typography/Title';

import { getCore, ServerError, Task } from 'cvat-core-wrapper';
import GoBackButton from 'components/common/go-back-button';
import CVATLoadingSpinner from 'components/common/loading-spinner';
import { useIsMounted } from 'utils/hooks';
import LabelCountsChart, { LabelAnnotationCount } from './label-counts-chart';
import { SocketStatus, useLabelCountsSocket } from './use-label-counts-socket';

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

async function fetchPageData(taskId: number): Promise<PageData> {
    const [[task], response] = await Promise.all([
        core.tasks.get({ id: taskId }),
        core.server.request<{ data: LabelAnalytics }>(`${core.config.backendAPI}/analytics/labels`, {
            method: 'GET',
            params: { task_id: taskId },
        }),
    ]);

    if (!task) {
        throw new Error('This task does not exist.');
    }

    return { task, analytics: response.data };
}

const SOCKET_STATUS_TAGS: Record<SocketStatus, { color: string, text: string }> = {
    connecting: { color: 'default', text: 'Connecting...' },
    live: { color: 'green', text: 'Live' },
    reconnecting: { color: 'orange', text: 'Reconnecting...' },
    off: { color: 'default', text: 'Live updates off' },
};

function LabelAnalyticsPage(): JSX.Element {
    const { tid } = useParams<{ tid: string }>();
    const taskId = +tid;
    const [data, setData] = useState<PageData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    const [groupByType, setGroupByType] = useState(false);

    const isMounted = useIsMounted();

    useEffect(() => {
        let cancelled = false;
        setData(null);
        setError(null);

        fetchPageData(taskId).then((pageData) => {
            if (!cancelled) {
                setData(pageData);
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

    // live updates replace the numbers in place, without the loading spinner
    const refreshCounts = useCallback(() => {
        fetchPageData(taskId).then((pageData) => {
            if (isMounted()) {
                setData(pageData);
                setError(null);
            }
        }).catch((_error: unknown) => {
            if (isMounted()) {
                setError(describeError(_error));
            }
        });
    }, [taskId]);

    const socketStatus = useLabelCountsSocket(taskId, refreshCounts);

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
                <Radio.Group
                    className='cvat-label-analytics-grouping'
                    optionType='button'
                    value={groupByType}
                    onChange={(event) => setGroupByType(event.target.value)}
                    options={[
                        { label: 'Total', value: false },
                        { label: 'By annotation type', value: true },
                    ]}
                />
                <LabelCountsChart
                    counts={analytics.results}
                    labelColors={labelColors}
                    groupByType={groupByType}
                />
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
                        <Title level={4}>
                            Annotations per class
                            <Tag
                                className='cvat-label-analytics-socket-status'
                                color={SOCKET_STATUS_TAGS[socketStatus].color}
                            >
                                {SOCKET_STATUS_TAGS[socketStatus].text}
                            </Tag>
                        </Title>
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
