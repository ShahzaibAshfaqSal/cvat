// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import {
    Chart as ChartJS, BarElement, CategoryScale, Legend, LinearScale, Tooltip,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

// chart.js is tree-shaken, so every part the chart uses has to be registered once
ChartJS.register(BarElement, CategoryScale, Legend, LinearScale, Tooltip);

export interface LabelAnnotationCount {
    label: string;
    count: number;
    by_type: Record<string, number>;
}

const DEFAULT_BAR_COLOR = '#1677ff';
const TYPE_COLORS = [
    '#1677ff', '#fa8c16', '#52c41a', '#eb2f96', '#722ed1',
    '#13c2c2', '#faad14', '#f5222d', '#2f54eb', '#a0d911',
];
const BAR_HEIGHT_PX = 24;
const MIN_CHART_HEIGHT_PX = 200;

interface Props {
    counts: LabelAnnotationCount[];
    labelColors: Record<string, string>;
    groupByType: boolean;
}

function typesByTotal(counts: LabelAnnotationCount[]): string[] {
    const totals: Record<string, number> = {};
    counts.forEach((item) => {
        Object.entries(item.by_type).forEach(([type, count]) => {
            totals[type] = (totals[type] ?? 0) + count;
        });
    });

    return Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
}

function LabelCountsChart(props: Readonly<Props>): JSX.Element {
    const { counts, labelColors, groupByType } = props;

    // horizontal bars keep long class names readable when a task has many labels (COCO has 80)
    const height = Math.max(MIN_CHART_HEIGHT_PX, counts.length * BAR_HEIGHT_PX);

    const datasets = groupByType ?
        typesByTotal(counts).map((type, index) => ({
            label: type,
            data: counts.map((item) => item.by_type[type] ?? 0),
            backgroundColor: TYPE_COLORS[index % TYPE_COLORS.length],
        })) :
        [{
            label: 'Annotations',
            data: counts.map((item) => item.count),
            backgroundColor: counts.map((item) => labelColors[item.label] ?? DEFAULT_BAR_COLOR),
        }];

    return (
        <div className='cvat-label-analytics-chart' style={{ height }}>
            <Bar
                data={{ labels: counts.map((item) => item.label), datasets }}
                options={{
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: groupByType, position: 'top' },
                    },
                    scales: {
                        x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
                        y: { stacked: true, ticks: { autoSkip: false } },
                    },
                }}
            />
        </div>
    );
}

export default React.memo(LabelCountsChart);
