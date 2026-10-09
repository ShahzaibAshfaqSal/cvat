// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import { useEffect, useRef, useState } from 'react';

export type SocketStatus = 'connecting' | 'live' | 'reconnecting' | 'off';

// wait longer after each failed attempt, so a server that is down is not flooded
const RETRY_DELAYS_MS = [1000, 2000, 5000, 10000, 30000];

// the server closes with these when retrying cannot help (bad request, no login, no access, no task)
const FINAL_CLOSE_CODES = [4400, 4401, 4403, 4404];

/**
 * Keeps a WebSocket open to the label counts endpoint of a task and calls onChange
 * when the task's annotations change. Reconnects by itself when the connection drops,
 * and calls onChange after a reconnect too, because changes may have been missed.
 */
export function useLabelCountsSocket(taskId: number, onChange: () => void): SocketStatus {
    const [status, setStatus] = useState<SocketStatus>('connecting');
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    useEffect(() => {
        let socket: WebSocket | null = null;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        let failedAttempts = 0;
        let stopped = false;

        const connect = (): void => {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            socket = new WebSocket(
                `${protocol}//${window.location.host}/api/analytics/labels/ws?task_id=${taskId}`,
            );

            socket.onmessage = (event: MessageEvent<string>) => {
                const message = JSON.parse(event.data);
                if (message.type === 'ready') {
                    if (failedAttempts > 0) {
                        onChangeRef.current();
                    }
                    failedAttempts = 0;
                    setStatus('live');
                } else if (message.type === 'annotations_changed') {
                    onChangeRef.current();
                }
            };

            socket.onclose = (event: CloseEvent) => {
                if (stopped) {
                    return;
                }

                if (FINAL_CLOSE_CODES.includes(event.code)) {
                    setStatus('off');
                    return;
                }

                setStatus('reconnecting');
                const delay = RETRY_DELAYS_MS[Math.min(failedAttempts, RETRY_DELAYS_MS.length - 1)];
                failedAttempts += 1;
                retryTimer = setTimeout(connect, delay);
            };
        };

        setStatus('connecting');
        connect();

        return () => {
            stopped = true;
            if (retryTimer) {
                clearTimeout(retryTimer);
            }
            socket?.close();
        };
    }, [taskId]);

    return status;
}
