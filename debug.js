// ========================================
// Debug
// ========================================

// ========================================
// 内部ログ
// ========================================

function addDebugLog(text) {

    if (!debugLog) {
        return;
    }

    const time =
        new Date().toLocaleTimeString();

    debugLog.textContent +=
        `[${time}] ${text}\n`;

    debugLog.scrollTop =
        debugLog.scrollHeight;
}

// ========================================
// デバッグ表示
// ========================================

function formatStateLabel(value, mapping) {

    if (!value) {
        return "---";
    }

    if (mapping[value]) {
        return mapping[value];
    }

    return String(value);
}

function formatCandidateType(value) {

    const mapping = {
        host: "Host",
        srflx: "STUN",
        relay: "TURN",
        prflx: "Prflx",
        unknown: "不明"
    };

    return formatStateLabel(value, mapping);
}

function updateDebugPeerStatus(text) {

    debugPeerStatus.textContent = text || "---";
}

function updateDebugPeerId(id) {

    debugPeerId.textContent =
        id || "---";
}

function updateDebugRemotePeer(id) {

    debugRemotePeer.textContent =
        id || "---";
}

function updateDebugIceState(state) {

    const mapping = {
        new: "未開始",
        checking: "確認中",
        connected: "接続済み",
        completed: "完了",
        failed: "失敗",
        disconnected: "切断",
        closed: "終了"
    };

    debugIceState.textContent =
        formatStateLabel(state, mapping);
}

function updateDebugConnectionState(state) {

    const mapping = {
        new: "未開始",
        connecting: "接続中",
        connected: "接続済み",
        failed: "失敗",
        disconnected: "切断",
        closed: "終了"
    };

    debugConnectionState.textContent =
        formatStateLabel(state, mapping);
}

function updateDebugSelectedRoute(text) {
    if (!debugSelectedRoute) {
        return;
    }

    debugSelectedRoute.textContent = text || "---";
}

function updateDebugDetailToggle() {
    if (!debugDetailToggle || !debugDetailPanel) {
        return;
    }

    debugDetailToggle.textContent =
        debugDetailPanel.hidden ? "詳細を表示" : "詳細を閉じる";
}

function getFirstNumericValue(report, keys) {
    if (!report) {
        return null;
    }

    for (const key of keys) {
        const value = report[key];

        if (
            typeof value === "number" &&
            Number.isFinite(value)
        ) {
            return value;
        }
    }

    return null;
}

function getFirstStringValue(report, keys) {
    if (!report) {
        return null;
    }

    for (const key of keys) {
        const value = report[key];

        if (typeof value === "string" && value.trim()) {
            return value.trim();
        }
    }

    return null;
}

function formatStatValue(value, suffix = "") {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return "---";
    }

    return `${value}${suffix}`;
}

function formatStabilityScore(score) {
    const value = Number.isFinite(score) ? score : 0;
    const clamped = Math.max(0, Math.min(100, value));
    return `${Math.round(clamped)} / 100`;
}

function updateDebugStabilityScores(overall, ice, route) {
    if (debugOverallStability) {
        debugOverallStability.textContent = formatStabilityScore(overall);
    }

    if (debugIceStability) {
        debugIceStability.textContent = formatStabilityScore(ice);
    }

    if (debugRouteStability) {
        debugRouteStability.textContent = formatStabilityScore(route);
    }
}

// ========================================
// デバッグパネル
// ========================================

debugToggle.addEventListener(
    "click",
    () => {

        debugPanel.hidden = false;

    }
);

debugClose.addEventListener(
    "click",
    () => {

        debugPanel.hidden = true;

    }
);

debugDetailToggle.addEventListener(
    "click",
    () => {

        if (!debugDetailPanel) {
            return;
        }

        debugDetailPanel.hidden = !debugDetailPanel.hidden;
        updateDebugDetailToggle();

    }
);

updateDebugDetailToggle();

// ========================================
// WebRTCデバッグ
// ========================================

async function updateWebRTCStats(conn) {

    try {

        if (
            !conn ||
            !conn.peerConnection
        ) {

            addDebugLog(
                "peerConnectionを取得できません"
            );

            return;

        }

        const pc =
            conn.peerConnection;

        updateDebugIceState(
            pc.iceConnectionState
        );

        updateDebugConnectionState(
            pc.connectionState
        );

        addDebugLog(
            "ICE: " +
            pc.iceConnectionState
        );

        addDebugLog(
            "Connection: " +
            pc.connectionState
        );

        // ========================================
        // イベント
        // ========================================

        if (!pc._debugListenersAdded) {

            pc.addEventListener(
                "iceconnectionstatechange",
                () => {

                    updateDebugIceState(
                        pc.iceConnectionState
                    );

                    addDebugLog(
                        "ICE状態変更: " +
                        pc.iceConnectionState
                    );

                    updateWebRTCStats(conn);

                }
            );

            pc.addEventListener(
                "connectionstatechange",
                () => {

                    updateDebugConnectionState(
                        pc.connectionState
                    );

                    addDebugLog(
                        "接続状態変更: " +
                        pc.connectionState
                    );

                }
            );

            pc._debugListenersAdded = true;

        }

        // ========================================
        // Stats
        // ========================================

        const stats =
            await pc.getStats();

        let hasHost = false;
        let hasSrflx = false;
        let hasRelay = false;

        const candidates = new Map();
        const candidatePairs = [];

        let selectedPair = null;
        let iceScore = 0;
        let routeScore = 0;
        let overallScore = 0;
        let rttValue = null;
        let bytesSentValue = null;
        let bytesReceivedValue = null;
        let packetsLostValue = null;

        stats.forEach(
            report => {

                if (
                    report.type === "local-candidate" ||
                    report.type === "remote-candidate"
                ) {

                    candidates.set(
                        report.id,
                        report
                    );

                    const candidateType =
                        getFirstStringValue(report, [
                            "candidateType",
                            "type"
                        ]);

                    if (
                        report.type ===
                        "local-candidate"
                    ) {

                        if (
                            candidateType ===
                            "host"
                        ) {
                            hasHost = true;
                        }

                        if (
                            candidateType ===
                            "srflx"
                        ) {
                            hasSrflx = true;
                        }

                        if (
                            candidateType ===
                            "relay"
                        ) {
                            hasRelay = true;
                        }

                    }

                }

                if (
                    report.type ===
                    "candidate-pair"
                ) {

                    candidatePairs.push(report);

                }

            }
        );

        debugHost.textContent =
            hasHost ? "あり" : "なし";

        debugSrflx.textContent =
            hasSrflx ? "あり" : "なし";

        debugRelay.textContent =
            hasRelay ? "あり" : "なし";

        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
            iceScore = 85;
        } else if (pc.iceConnectionState === "checking") {
            iceScore = 55;
        } else if (pc.iceConnectionState === "failed") {
            iceScore = 15;
        } else if (pc.iceConnectionState === "disconnected") {
            iceScore = 30;
        } else {
            iceScore = 40;
        }

        if (hasRelay) {
            routeScore = 55;
        } else if (hasSrflx) {
            routeScore = 75;
        } else if (hasHost) {
            routeScore = 90;
        } else {
            routeScore = 35;
        }

        overallScore = Math.round((iceScore * 0.7) + (routeScore * 0.3));
        updateDebugStabilityScores(overallScore, iceScore, routeScore);

        // ========================================
        // 選択Candidate Pair
        // ========================================

        stats.forEach(
            report => {

                if (
                    report.type === "transport" &&
                    report.selectedCandidatePairId
                ) {

                    const pair =
                        stats.get(
                            report.selectedCandidatePairId
                        );

                    if (pair) {
                        selectedPair = pair;
                    }

                }

            }
        );

        if (!selectedPair) {

            for (
                const pair of candidatePairs
            ) {

                if (
                    pair.state === "succeeded"
                ) {

                    selectedPair = pair;
                    break;

                }

            }

        }

        // ========================================
        // 経路表示
        // ========================================

        if (selectedPair) {

            const localCandidate =
                candidates.get(
                    selectedPair.localCandidateId
                );

            const remoteCandidate =
                candidates.get(
                    selectedPair.remoteCandidateId
                );

            const localType =
                formatCandidateType(
                    localCandidate?.candidateType
                );

            const remoteType =
                formatCandidateType(
                    remoteCandidate?.candidateType
                );

            debugLocalCandidate.textContent =
                localType;

            debugRemoteCandidate.textContent =
                remoteType;

            const routeSummary =
                localType === remoteType ?
                    localType :
                    `${localType} → ${remoteType}`;

            if (localType === "TURN" || remoteType === "TURN") {
                routeScore = 55;
            } else if (localType === "STUN" || remoteType === "STUN") {
                routeScore = 75;
            } else {
                routeScore = 90;
            }

            overallScore = Math.round((iceScore * 0.7) + (routeScore * 0.3));
            updateDebugStabilityScores(overallScore, iceScore, routeScore);
            updateDebugSelectedRoute(routeSummary);

            addDebugLog(
                "選択Candidate Pair"
            );

            addDebugLog(
                "Local: " + localType
            );

            addDebugLog(
                "Remote: " + remoteType
            );

            addDebugLog(
                "Pair state: " +
                selectedPair.state
            );

        } else {

            updateDebugSelectedRoute("未確定");
            addDebugLog(
                "選択Candidate Pairを取得できません"
            );

        }

        // ========================================
        // 詳細メトリクス
        // ========================================

        let candidatePairStats = null;

        stats.forEach(
            report => {

                if (
                    report.type === "candidate-pair" &&
                    (
                        report.state === "succeeded" ||
                        report.state === "selected" ||
                        report.selected === true
                    )
                ) {
                    candidatePairStats = report;
                }

                const transportRtt =
                    getFirstNumericValue(report, [
                        "currentRoundTripTime",
                        "roundTripTime",
                        "roundTripTimeMs",
                        "averageRoundTripTime",
                        "rtt"
                    ]);

                if (
                    transportRtt !== null &&
                    (report.type === "transport" || report.type === "candidate-pair")
                ) {
                    rttValue = transportRtt;
                }

                const bytesSent =
                    getFirstNumericValue(report, [
                        "bytesSent",
                        "totalBytesSent"
                    ]);

                if (
                    bytesSent !== null &&
                    report.type === "outbound-rtp"
                ) {
                    bytesSentValue = bytesSent;
                }

                const bytesReceived =
                    getFirstNumericValue(report, [
                        "bytesReceived",
                        "totalBytesReceived"
                    ]);

                if (
                    bytesReceived !== null &&
                    report.type === "inbound-rtp"
                ) {
                    bytesReceivedValue = bytesReceived;
                }

                const packetsLost =
                    getFirstNumericValue(report, [
                        "packetsLost",
                        "totalPacketsLost",
                        "packetsLostRate"
                    ]);

                if (
                    packetsLost !== null &&
                    report.type === "inbound-rtp"
                ) {
                    packetsLostValue = packetsLost;
                }

            }
        );

        if (debugRtt) {
            debugRtt.textContent =
                rttValue !== null ? `${(rttValue * 1000).toFixed(0)} ms` : "---";
        }

        if (debugBytesSent) {
            debugBytesSent.textContent =
                bytesSentValue !== null ? `${bytesSentValue} bytes` : "---";
        }

        if (debugBytesReceived) {
            debugBytesReceived.textContent =
                bytesReceivedValue !== null ? `${bytesReceivedValue} bytes` : "---";
        }

        if (debugPacketsLost) {
            debugPacketsLost.textContent =
                packetsLostValue !== null ? `${packetsLostValue} packets` : "---";
        }

        if (debugRawStats) {
            const rawEntries = [];
            stats.forEach(report => {
                const item = {
                    id: report.id,
                    type: report.type,
                    timestamp: report.timestamp
                };

                Object.keys(report).forEach(key => {
                    if (
                        !["id", "type", "timestamp"].includes(key) &&
                        report[key] !== undefined
                    ) {
                        item[key] = report[key];
                    }
                });

                rawEntries.push(item);
            });

            debugRawStats.textContent = JSON.stringify(rawEntries, null, 2).slice(0, 2000);
        }

        const statTypes = new Set();

        stats.forEach(
            report => {

                statTypes.add(
                    report.type
                );

            }
        );

        addDebugLog(
            "Stats種類: " +
            [...statTypes].join(", ")
        );

    } catch (error) {

        console.error(
            "WebRTC状態取得エラー:",
            error
        );

        addDebugLog(
            "WebRTC Stats ERROR: " +
            error.message
        );

    }

}