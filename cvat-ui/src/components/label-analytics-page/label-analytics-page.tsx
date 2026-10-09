// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import './styles.scss';

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Row, Col } from 'antd/lib/grid';
import Alert from 'antd/lib/alert';
import Card from 'antd/lib/card';
import Table from 'antd/lib/table';
import Text from 'antd/lib/typography/Text';
import Title from 'antd/lib/typography/Title';

import { getCore } from 'cvat-core-wrapper';
import GoBackButton from 'components/common/go-back-button';
import CVATLoadingSpinner from 'components/common/loading-spinner';

const core = getCore();

interface LabelAnnotationCount {
    label: string;
    count: number;
}

interface LabelAnalytics {
    task_id: number;
    total: number;
    results: LabelAnnotationCount[];
}

function LabelAnalyticsPage(): JSX.Element {
    const { tid } = useParams<{ tid: string }>();
    const taskId = +tid;
    const [analytics, setAnalytics] = useState<LabelAnalytics | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setAnalytics(null);
        setError(null);

        core.server.request<{ data: LabelAnalytics }>(`${core.config.backendAPI}/analytics/labels`, {
            method: 'GET',
            params: { task_id: taskId },
        }).then((response) => {
            if (!cancelled) {
                setAnalytics(response.data);
            }
        }).catch((_error: unknown) => {
            if (!cancelled) {
                setError(_error instanceof Error ? _error.message : 'Unknown error');
            }
        });

        return () => {
            cancelled = true;
        };
    }, [taskId]);

    let content: JSX.Element;
    if (error) {
        content = <Alert type='error' showIcon message='Could not load annotation counts' description={error} />;
    } else if (!analytics) {
        content = <CVATLoadingSpinner size='large' />;
    } else {
        content = (
            <Table
                className='cvat-label-analytics-table'
                size='small'
                rowKey='label'
                pagination={false}
                dataSource={analytics.results}
                columns={[
                    { title: 'Label', dataIndex: 'label' },
                    { title: 'Annotations', dataIndex: 'count', align: 'right' },
                ]}
            />
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
                        <Text type='secondary'>{`Task #${taskId}`}</Text>
                        <div className='cvat-label-analytics-content'>{content}</div>
                    </Card>
                </Col>
            </Row>
        </div>
    );
}

export default React.memo(LabelAnalyticsPage);
