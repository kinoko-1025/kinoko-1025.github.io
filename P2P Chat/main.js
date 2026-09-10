// ========================================
// P2P Chat
// main.js
// ========================================

// ========================================
// DOM
// ========================================

const myId = document.getElementById("my-id");
const peerIdInput = document.getElementById("peer-id");
const connectButton = document.getElementById("connect");
const reconnectButton = document.getElementById("reconnect");
const disconnectButton = document.getElementById("disconnect");
const cancelTransferButton = document.getElementById("cancel-transfer");
const status = document.getElementById("status");

const messageInput = document.getElementById("message");
const sendButton = document.getElementById("send");
const attach = document.getElementById("attach");
const fileInput = document.getElementById("file");
const transferProgress = document.getElementById("transfer-progress");
const transferProgressLabel = document.getElementById("transfer-progress-label");
const transferProgressText = document.getElementById("transfer-progress-text");
const transferProgressFill = document.getElementById("transfer-progress-fill");

const messages = document.getElementById("messages");

// デバッグパネル
const debugToggle = document.getElementById("debug-toggle");
const debugPanel = document.getElementById("debug-panel");
const debugClose = document.getElementById("debug-close");

const debugPeerStatus =
    document.getElementById("debug-peer-status");

const debugPeerId =
    document.getElementById("debug-peer-id");

const debugIceState =
    document.getElementById("debug-ice-state");

const debugConnectionState =
    document.getElementById("debug-connection-state");

const debugOverallStability =
    document.getElementById("debug-overall-stability");

const debugIceStability =
    document.getElementById("debug-ice-stability");

const debugRouteStability =
    document.getElementById("debug-route-stability");

const debugHost =
    document.getElementById("debug-host");

const debugSrflx =
    document.getElementById("debug-srflx");

const debugRelay =
    document.getElementById("debug-relay");

const debugSelectedRoute =
    document.getElementById("debug-selected-route");

const debugLocalCandidate =
    document.getElementById("debug-local-candidate");

const debugRemoteCandidate =
    document.getElementById("debug-remote-candidate");

const debugRemotePeer =
    document.getElementById("debug-remote-peer");

const debugDetailToggle =
    document.getElementById("debug-detail-toggle");

const debugDetailPanel =
    document.getElementById("debug-detail-panel");

const debugRtt =
    document.getElementById("debug-rtt");

const debugBytesSent =
    document.getElementById("debug-bytes-sent");

const debugBytesReceived =
    document.getElementById("debug-bytes-received");

const debugPacketsLost =
    document.getElementById("debug-packets-lost");

const debugRawStats =
    document.getElementById("debug-raw-stats");

const debugLog =
    document.getElementById("debug-log");

// ========================================
// 接続状態
// ========================================

let connection = null;
let peer = null;
let peerInitPromise = null;
let connectionAttemptTimeout = null;
let connectionRetryTimer = null;
let connectionRetryCount = 0;
let connectionTargetId = null;
let isManualDisconnect = false;
let connectionRetryScheduled = false;
let cancelTransferRequested = false;
let transferCancelReason = null;

const CONNECTION_STATES = Object.freeze({
    idle: "idle",
    connecting: "connecting",
    connected: "connected",
    failed: "failed",
    disconnected: "disconnected"
});

const DEFAULT_STUN_SERVERS = [
    "stun:stun.l.google.com:19302",
    "stun:stun1.l.google.com:19302"
];

function normalizeStunServers(value) {
    if (!value) {
        return DEFAULT_STUN_SERVERS;
    }

    const entries = Array.isArray(value) ? value : [value];
    const normalized = entries
        .map(item => String(item || "").trim())
        .filter(item => item.includes("stun:") || item.includes("stuns:"));

    return normalized.length ? normalized : DEFAULT_STUN_SERVERS;
}

function getConfiguredStunServers() {
    if (typeof window !== "undefined" && window.STUN_SERVERS) {
        return normalizeStunServers(window.STUN_SERVERS);
    }

    if (typeof globalThis !== "undefined" && globalThis.STUN_SERVERS) {
        return normalizeStunServers(globalThis.STUN_SERVERS);
    }

    return DEFAULT_STUN_SERVERS;
}

function setStunServers(value) {
    const normalized = normalizeStunServers(value);

    if (typeof window !== "undefined") {
        window.STUN_SERVERS = normalized;
    }

    if (typeof globalThis !== "undefined") {
        globalThis.STUN_SERVERS = normalized;
    }

    return normalized;
}

function normalizeTurnConfig(config) {
    if (!config || typeof config !== "object") {
        return null;
    }

    const rawUrls = Array.isArray(config.urls) ? config.urls : (
        config.url ? [config.url] : (
            config.urls ? [config.urls] : []
        )
    );

    const urls = rawUrls
        .map(url => String(url || "").trim())
        .filter(url => url.includes("turn:") || url.includes("turns:"));

    if (!urls.length) {
        return null;
    }

    return {
        urls,
        username: config.username ? String(config.username) : "",
        credential: config.credential ? String(config.credential) : ""
    };
}

function getConfiguredTurnConfig() {
    let config = null;

    if (typeof window !== "undefined") {
        config = window.TURN_CONFIG || null;
    }

    if (!config && typeof globalThis !== "undefined") {
        config = globalThis.TURN_CONFIG || null;
    }

    return normalizeTurnConfig(config);
}

function setTurnConfig(config) {
    const normalized = normalizeTurnConfig(config);

    if (typeof window !== "undefined") {
        window.TURN_CONFIG = normalized;
    }

    if (typeof globalThis !== "undefined") {
        globalThis.TURN_CONFIG = normalized;
    }

    return normalized;
}

function hasTurnCredentialsConfigured() {
    return Boolean(getConfiguredTurnConfig());
}

function getIceServers() {
    const stunServers = getConfiguredStunServers();
    const iceServers = [
        {
            urls: stunServers
        }
    ];

    const config = getConfiguredTurnConfig();

    if (config) {
        iceServers.push({
            urls: config.urls,
            username: config.username || "",
            credential: config.credential || ""
        });
    }

    return iceServers;
}

if (typeof window !== "undefined") {
    window.setStunServers = setStunServers;
    window.setTurnConfig = setTurnConfig;
    window.getConfiguredTurnConfig = getConfiguredTurnConfig;
    window.getConfiguredStunServers = getConfiguredStunServers;
    window.getIceServers = getIceServers;
    window.forceConnectionFailure = function(kind = "connection") {
        const label = String(kind || "connection").toLowerCase();

        if (label === "peer" || label === "peerjs") {
            if (peer && peer.destroy) {
                try {
                    peer.destroy();
                } catch (error) {
                    addDebugLog("テスト用Peer破壊失敗: " + String(error));
                }
            }
            peer = null;
            peerInitPromise = null;
            setConnectionStatus("テスト用に Peer を破壊しました", CONNECTION_STATES.failed);
            addSystemMessage("テスト: Peer を破壊しました。自動復旧を確認してください。");
            return true;
        }

        if (label === "ice" || label === "network") {
            if (connection && connection.peerConnection) {
                const pc = connection.peerConnection;
                try {
                    pc.close();
                } catch (error) {
                    addDebugLog("テスト用ICE破壊失敗: " + String(error));
                }
            }
            setConnectionStatus("テスト用に ICE 接続を破壊しました", CONNECTION_STATES.failed);
            addSystemMessage("テスト: ICE 接続を破壊しました。自動復旧を確認してください。");
            return true;
        }

        if (label === "data" || label === "datachannel") {
            if (connection && connection.close) {
                try {
                    connection.close();
                } catch (error) {
                    addDebugLog("テスト用DataChannel破壊失敗: " + String(error));
                }
            }
            setConnectionStatus("テスト用に DataChannel を破壊しました", CONNECTION_STATES.failed);
            addSystemMessage("テスト: DataChannel を破壊しました。自動復旧を確認してください。");
            return true;
        }

        if (connection && connection.peerConnection) {
            try {
                connection.peerConnection.close();
            } catch (error) {
                addDebugLog("テスト用接続破壊失敗: " + String(error));
            }
        }

        setConnectionStatus("テスト用に接続を破壊しました", CONNECTION_STATES.failed);
        addSystemMessage("テスト: 接続を破壊しました。自動復旧を確認してください。");
        return true;
    };
    window.disableFailureTest = function() {
        if (typeof globalThis !== "undefined") {
            globalThis.__FORCE_TRANSFER_CORRUPTION__ = false;
            globalThis.__FORCE_RETRY_FAILURE__ = false;
        }
        addSystemMessage("テスト用故障モードを解除しました");
        return true;
    };
}

const ICE_SERVERS = getIceServers();

const STUN_ONLY_MODE = !hasTurnCredentialsConfigured();

const NORMAL_RETRY_LIMIT = 5;
const TURN_FALLBACK_TIMEOUT_MS = 15000;
const FAILURE_ALERT_COOLDOWN_MS = 20000;
let lastFailureAlertAt = 0;

function showFailureAlert(reason, detail) {
    const now = Date.now();
    if (now - lastFailureAlertAt < FAILURE_ALERT_COOLDOWN_MS) {
        addDebugLog("alert抑止: " + reason + " | " + String(detail));
        return false;
    }

    lastFailureAlertAt = now;
    const fullMessage = `${reason}\n\n詳細: ${detail}`;

    try {
        alert(fullMessage);
    } catch (error) {
        console.error("alert失敗:", error);
        addDebugLog("alert実行失敗: " + String(error));
    }

    addSystemMessage(reason);
    addDebugLog("ALERT: " + String(detail));
    return true;
}

function beginNormalConnectionAttempt(id, isRetry = false) {
    clearConnectionRetryTimer();
    connectionTargetId = id;

    if (!isRetry) {
        connectionRetryCount = 0;
    }

    const statusMessage = isRetry ?
        `再接続中... (${connectionRetryCount}/4)` :
        "相手に接続しています...";

    setConnectionStatus(
        statusMessage,
        CONNECTION_STATES.connecting
    );

    addDebugLog(
        "接続開始: " + id + (isRetry ? " (retry)" : "")
    );

    updateDebugRemotePeer(id);
    startConnectionAttemptTimeout(id);
}

function handleNormalConnectionFailure(id) {
    setConnectionStatus(
        `相手との接続がタイムアウトしました: ${id}`,
        CONNECTION_STATES.failed
    );

    addDebugLog(
        "接続タイムアウト: " + id
    );

    if (connectionTargetId) {
        applyNetworkFallbackStrategy(connection, connectionRetryCount + 1).catch(error => {
            addDebugLog("タイムアウト時fallback判定失敗: " + String(error));
        });
        scheduleConnectionRetry(connectionTargetId);
    }
}

function getCandidateTypesFromStats(stats) {
    const types = new Set();

    if (!stats) {
        return [];
    }

    stats.forEach(report => {
        if (
            report.type === "local-candidate" ||
            report.type === "remote-candidate"
        ) {
            const candidateType =
                typeof report.candidateType === "string" ?
                    report.candidateType.trim() :
                    "";

            if (candidateType) {
                types.add(candidateType);
            }
        }
    });

    return [...types];
}

async function evaluateNetworkFailure(conn, retryCount = connectionRetryCount) {
    const pc = conn && conn.peerConnection ? conn.peerConnection : null;
    let candidateTypes = [];

    if (pc && typeof pc.getStats === "function") {
        try {
            const stats = await pc.getStats();
            candidateTypes = getCandidateTypesFromStats(stats);
        } catch (error) {
            addDebugLog("ネットワーク戦略の統計取得に失敗: " + String(error));
        }
    }

    const decision = {
        iceState: pc ? pc.iceConnectionState : null,
        connectionState: pc ? pc.connectionState : null,
        candidateTypes,
        retryCount,
        turnConfigured: hasTurnCredentialsConfigured(),
        hasRelayCandidate: candidateTypes.includes("relay")
    };

    const reason =
        typeof window !== "undefined" &&
        typeof window.evaluateConnectionFailureReason === "function" ?
            window.evaluateConnectionFailureReason(decision) :
            (decision.iceState === "failed" || decision.connectionState === "failed" ?
                (decision.turnConfigured ? "turn-needed" : "nat-or-firewall-blocked") :
                "stun-not-yet-tested");

    const plan =
        typeof window !== "undefined" &&
        typeof window.getFallbackPlan === "function" ?
            window.getFallbackPlan(decision) :
            (retryCount === 0 ? "stun-check" : (decision.turnConfigured ? "turn-retry" : "relay-fallback"));

    return {
        reason,
        plan,
        decision
    };
}

function shouldUseTurn(conn) {
    if (!conn || !conn.peerConnection) {
        return false;
    }

    const pc = conn.peerConnection;

    return (
        pc.iceConnectionState === "failed" ||
        pc.connectionState === "failed" ||
        pc.iceConnectionState === "disconnected" ||
        pc.iceConnectionState === "closed" ||
        pc.connectionState === "closed"
    );
}

async function applyNetworkFallbackStrategy(conn, retryCount = connectionRetryCount) {
    if (!conn || !conn.peerConnection) {
        return false;
    }

    const result = await evaluateNetworkFailure(conn, retryCount);

    addDebugLog(
        "ネットワーク戦略判定: reason=" + result.reason + ", plan=" + result.plan
    );

    if (result.plan === "turn-retry") {
        if (hasTurnCredentialsConfigured()) {
            addDebugLog("TURN戦略を適用します");
            setConnectionStatus(
                "TURN経由での再接続を試しています...",
                CONNECTION_STATES.connecting
            );
            return applyTurnFallback(conn);
        }

        addDebugLog("TURN設定がないため、relay fallback を選択します");
    }

    if (result.plan === "relay-fallback" || result.reason === "nat-or-firewall-blocked") {
        addDebugLog("学校/社内回線の制約が見られるため、中継経路を検討します");

        const turnDisabledMessage =
            "P2P 直通が制限されています。STUNでも候補が見つからず、TURN 未設定のため自動中継は利用できません。別ネットワークで再試行するか、TURN を設定してください。";

        setConnectionStatus(
            turnDisabledMessage,
            CONNECTION_STATES.failed
        );
        addSystemMessage(
            turnDisabledMessage
        );
        addDebugLog(
            "STUN候補なし: NAT / firewall / UDP制限の可能性が高い。TURN未設定のため中継不可。"
        );
        return false;
    }

    return false;
}

function setConnectionStatus(message, state = CONNECTION_STATES.idle) {
    status.textContent = message;
    status.dataset.state = state;
}

function setCancelTransferButtonVisible(visible) {
    if (!cancelTransferButton) {
        return;
    }

    cancelTransferButton.hidden = !visible;
    cancelTransferButton.disabled = false;
}

function cancelCurrentTransfer() {
    cancelTransferRequested = true;
    transferCancelReason = "user-cancelled";

    if (cancelTransferButton) {
        cancelTransferButton.disabled = true;
    }

    hideTransferProgress();
    addSystemMessage("送信を停止しました");
    addDebugLog("ユーザーによる送信停止");
}

function clearConnectionAttemptTimeout() {
    if (connectionAttemptTimeout) {
        clearTimeout(connectionAttemptTimeout);
        connectionAttemptTimeout = null;
    }
}

function clearConnectionRetryTimer() {
    if (connectionRetryTimer) {
        clearTimeout(connectionRetryTimer);
        connectionRetryTimer = null;
    }
}

function resetConnectionState() {
    clearConnectionAttemptTimeout();
    clearConnectionRetryTimer();
    connection = null;
    connectionTargetId = null;
    connectionRetryCount = 0;
    connectionRetryScheduled = false;
}

function isActiveConnectionTarget(id) {
    if (!id) {
        return false;
    }

    if (connectionTargetId === id) {
        return true;
    }

    return Boolean(connection && connection.peer === id && connection.open);
}

function scheduleConnectionRetry(id) {
    if (isManualDisconnect || !peer || !id) {
        return;
    }

    if (connectionRetryScheduled && connectionTargetId === id) {
        return;
    }

    if (isActiveConnectionTarget(id) && (connectionRetryScheduled || connectionAttemptTimeout)) {
        return;
    }

    if (connectionRetryCount >= NORMAL_RETRY_LIMIT) {
        const failMessage =
            `接続に失敗しました: ${id}。STUN候補が確保できず、TURN 未設定のため直接接続できません。別ネットワークを試すか、TURN を設定してください。`;

        setConnectionStatus(
            failMessage,
            CONNECTION_STATES.failed
        );
        addDebugLog(
            "接続再試行上限到達: " + id + "（NAT/ICE制約の可能性。TURN未設定）"
        );
        addSystemMessage(
            failMessage
        );
        return;
    }

    clearConnectionRetryTimer();
    connectionRetryCount += 1;
    connectionTargetId = id;
    connectionRetryScheduled = true;

    const delayMs = 1500 * connectionRetryCount + 500;
    const retryLabel = connectionRetryCount >= 3 ?
        `学校/社内回線の制約に備えて、TURN/中継経路を確認しています (${connectionRetryCount}/${NORMAL_RETRY_LIMIT})...` :
        `接続を再試行しています (${connectionRetryCount}/${NORMAL_RETRY_LIMIT})...`;

    setConnectionStatus(
        retryLabel,
        CONNECTION_STATES.connecting
    );

    addDebugLog(
        "接続再試行予定: " + id + " (" + connectionRetryCount + "/" + NORMAL_RETRY_LIMIT + ") " + delayMs + "ms"
    );

    if (connection && connection.peerConnection) {
        applyNetworkFallbackStrategy(connection, connectionRetryCount).catch(error => {
            addDebugLog("fallback判定失敗: " + String(error));
        });
    }

    connectionRetryTimer = setTimeout(() => {
        connectionRetryScheduled = false;

        if (!peer) {
            return;
        }

        connectToPeerId(id, true);
    }, delayMs);
}

function connectToPeerId(id, isRetry = false) {
    if (!peer || !id) {
        return;
    }

    if (connection && connection.peer === id && (connection.open || connection.pending)) {
        setConnectionStatus(
            "既に接続を試行中です",
            CONNECTION_STATES.connecting
        );
        return;
    }

    if (connectionTargetId === id && connectionAttemptTimeout) {
        return;
    }

    connectionRetryScheduled = false;
    connectionTargetId = id;
    beginNormalConnectionAttempt(id, isRetry);

    const conn = peer.connect(id, {
        reliable: true
    });

    connection = conn;

    if (conn.open) {
        setConnectionStatus(
            "接続しました",
            CONNECTION_STATES.connected
        );
        clearConnectionAttemptTimeout();
        connectionRetryCount = 0;
    }

    setupTurnFallback(conn);
    setupConnection(conn);
    registerConnectionHealthMonitor(conn);
}

function startConnectionAttemptTimeout(id) {
    clearConnectionAttemptTimeout();

    connectionAttemptTimeout = setTimeout(() => {
        if (!connection || !connection.open) {
            handleNormalConnectionFailure(id);
        }
    }, TURN_FALLBACK_TIMEOUT_MS);
}

function applyTurnFallback(conn) {
    if (!conn || !conn.peerConnection) {
        return false;
    }

    const pc = conn.peerConnection;

    if (!hasTurnCredentialsConfigured()) {
        addDebugLog("TURN設定が未定義のため、TURN切替はスキップしました");
        return false;
    }

    try {
        pc.setConfiguration({
            iceServers: getIceServers()
        });

        if (typeof pc.restartIce === "function") {
            pc.restartIce();
        }

        addDebugLog("TURN設定を反映してICEを再開始しました");
        setConnectionStatus(
            "TURN経由への切り替えを試しています...",
            CONNECTION_STATES.connecting
        );
        addSystemMessage(
            "直接接続が不安定なため、TURN経由の接続を試しています。"
        );
        return true;
    } catch (error) {
        addDebugLog("TURN切替失敗: " + (error && error.message ? error.message : String(error)));
        return false;
    }
}

function setupTurnFallback(conn) {
    if (!conn || !conn.peerConnection) {
        return;
    }

    const pc = conn.peerConnection;

    const monitor = () => {
        if (shouldUseTurn(conn)) {
            addDebugLog(
                "TURNへ切り替えが必要と判断しました"
            );
            applyNetworkFallbackStrategy(conn, connectionRetryCount + 1).catch(error => {
                addDebugLog("状態変化時fallback判定失敗: " + String(error));
            });
            applyTurnFallback(conn);
        }
    };

    pc.addEventListener("iceconnectionstatechange", monitor);
    pc.addEventListener("connectionstatechange", monitor);
    pc.addEventListener("icegatheringstatechange", monitor);
}

function disconnectPeerConnection() {
    isManualDisconnect = true;
    connectionRetryScheduled = false;
    clearConnectionAttemptTimeout();
    clearConnectionRetryTimer();

    if (connection && connection.peerConnection && typeof connection.peerConnection.close === "function") {
        try {
            connection.peerConnection.close();
        } catch (error) {
            addDebugLog("peerConnection close失敗: " + String(error));
        }
    }

    if (connection && connection.close) {
        try {
            connection.close();
        } catch (error) {
            addDebugLog("DataConnection close失敗: " + String(error));
        }
    }

    if (peer && peer.destroy) {
        try {
            peer.destroy();
        } catch (error) {
            addDebugLog("Peer destroy失敗: " + String(error));
        }
    }

    peer = null;
    peerInitPromise = null;
    resetConnectionState();

    setConnectionStatus(
        "切断しました",
        CONNECTION_STATES.disconnected
    );

    addSystemMessage(
        "接続を切断しました"
    );

    addDebugLog(
        "手動切断"
    );
}

function markConnectionFailure(label, detail) {
    setConnectionStatus(label, CONNECTION_STATES.failed);
    addDebugLog(detail);
    addSystemMessage(label);
    showFailureAlert(label, detail);
}

function attemptConnectionRecovery(conn) {
    if (!conn || !conn.peerConnection) {
        return false;
    }

    const pc = conn.peerConnection;
    const iceState = pc.iceConnectionState || "unknown";
    const connectionState = pc.connectionState || "unknown";
    const shouldRecover = ["failed", "disconnected", "closed"].includes(iceState) ||
        ["failed", "disconnected", "closed"].includes(connectionState);

    if (!shouldRecover || isManualDisconnect) {
        return false;
    }

    try {
        if (typeof pc.setConfiguration === "function") {
            pc.setConfiguration({
                iceServers: getIceServers()
            });
        }

        if (typeof pc.restartIce === "function") {
            pc.restartIce();
        }

        setConnectionStatus(
            "接続が不安定のため、自動復旧を試しています...",
            CONNECTION_STATES.connecting
        );
        addDebugLog("自動復旧を試行: ice=" + iceState + ", connection=" + connectionState);
        return true;
    } catch (error) {
        addDebugLog("自動復旧失敗: " + String(error));
        return false;
    }
}

async function attemptPeerRecovery(reason) {
    if (isManualDisconnect) {
        return false;
    }

    addDebugLog("Peer自動復旧試行: " + String(reason));

    try {
        if (peer && peer.destroy) {
            peer.destroy();
        }
    } catch (error) {
        addDebugLog("Peer destroy失敗: " + String(error));
    }

    peer = null;
    peerInitPromise = null;
    connection = null;

    setConnectionStatus(
        "Peerを再初期化して再接続を試しています...",
        CONNECTION_STATES.connecting
    );

    try {
        await startPeer();
        if (connectionTargetId) {
            setTimeout(() => connectToPeerId(connectionTargetId, true), 500);
        }
        return true;
    } catch (error) {
        addDebugLog("Peer再初期化失敗: " + String(error));
        return false;
    }
}

function registerConnectionHealthMonitor(conn) {
    if (!conn || !conn.peerConnection) {
        return;
    }

    const pc = conn.peerConnection;
    let staleSince = 0;

    const evaluate = () => {
        if (!pc || isManualDisconnect) {
            staleSince = 0;
            return;
        }

        const iceState = pc.iceConnectionState || "unknown";
        const connectionState = pc.connectionState || "unknown";
        const badState = ["failed", "disconnected", "closed"].includes(iceState) ||
            ["failed", "disconnected", "closed"].includes(connectionState);

        if (!badState) {
            staleSince = 0;
            return;
        }

        if (!staleSince) {
            staleSince = Date.now();
            return;
        }

        if (Date.now() - staleSince >= 5000) {
            if (attemptConnectionRecovery(conn)) {
                staleSince = Date.now();
                return;
            }

            showFailureAlert(
                "接続が壊れている可能性があります。再接続または TURN 設定をご確認ください。",
                `ice=${iceState}, connection=${connectionState}, peer=${conn.peer || "unknown"}`
            );
            staleSince = Date.now();
        }
    };

    pc.addEventListener("iceconnectionstatechange", evaluate);
    pc.addEventListener("connectionstatechange", evaluate);
    pc.addEventListener("statechange", evaluate);
    evaluate();
}

if (cancelTransferButton) {
    cancelTransferButton.addEventListener(
        "click",
        () => {
            cancelCurrentTransfer();
        }
    );
}

window.addEventListener(
    "beforeunload",
    () => {
        if (peer) {
            peer.destroy();
        }
    }
);

// ========================================
// 起動
// ========================================
