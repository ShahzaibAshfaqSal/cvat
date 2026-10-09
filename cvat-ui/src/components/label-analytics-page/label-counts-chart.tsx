// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import {
    Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

// chart.js is tree-shaken, so every part the chart uses has to be registered once
ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip);

export interface LabelAnnotationCount {
    label: string;
    count: number;
}

const DEFAULT_BAR_COLOR = '#1677ff';
const BAR_HEIGHT_PX = 24;
const MIN_CHART_HEIGHT_PX = 200;

interface Props {
    counts: LabelAnnotationCount[];
    labelColors: Record<string, string>;
}

function LabelCountsChart(props: Readonly<Props>): JSX.Element {
    const { counts, labelColors } = props;

    // horizontal bars keep long class names readable when a task has many labels (COCO has 80)
    const height = Math.max(MIN_CHART_HEIGHT_PX, counts.length * BAR_HEIGHT_PX);

    return (
        <div className='cvat-label-analytics-chart' style={{ height }}>
            <Bar
                data={{
                    labels: counts.map((item) => item.label),
                    datasets: [{
                        label: 'Annotations',
                        data: counts.map((item) => item.count),
                        backgroundColor: counts.map((item) => labelColors[item.label] ?? DEFAULT_BAR_COLOR),
                    }],
                }}
                options={{
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { beginAtZero: true, ticks: { precision: 0 } },
                        y: { ticks: { autoSkip: false } },
                    },
                }}
            />
        </div>
    );
}

export default React.memo(LabelCountsChart);
