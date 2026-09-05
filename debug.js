// ========================================
// Debug
// ========================================

alert("debug.js 読み込み成功");

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

function updateDebugPeerStatus(text) {

    debugPeerStatus.textContent = text;
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

    debugIceState.textContent =
        state || "---";
}

function updateDebugConnectionState(state) {

    debugConnectionState.textContent =
        state || "---";
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

                    if (
                        report.type ===
                        "local-candidate"
                    ) {

                        if (
                            report.candidateType ===
                            "host"
                        ) {
                            hasHost = true;
                        }

                        if (
                            report.candidateType ===
                            "srflx"
                        ) {
                            hasSrflx = true;
                        }

                        if (
                            report.candidateType ===
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
            hasHost ? "✓" : "×";

        debugSrflx.textContent =
            hasSrflx ? "✓" : "×";

        debugRelay.textContent =
            hasRelay ? "✓" : "×";

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
                localCandidate?.candidateType ||
                "---";

            const remoteType =
                remoteCandidate?.candidateType ||
                "---";

            debugLocalCandidate.textContent =
                localType;

            debugRemoteCandidate.textContent =
                remoteType;

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

            addDebugLog(
                "選択Candidate Pairを取得できません"
            );

        }

        // ========================================
        // Stats種類
        // ========================================

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