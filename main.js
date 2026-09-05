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
const disconnectButton = document.getElementById("disconnect");
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

const CONNECTION_STATES = Object.freeze({
    idle: "idle",
    connecting: "connecting",
    connected: "connected",
    failed: "failed",
    disconnected: "disconnected"
});

const ICE_SERVERS = [
    {
        urls: [
            "stun:stun.l.google.com:19302",
            "stun:stun1.l.google.com:19302"
        ]
    },
    {
        urls: [
            "turn:your-turn-server.example.com:3478?transport=udp",
            "turn:your-turn-server.example.com:3478?transport=tcp"
        ],
        username: "demo-user",
        credential: "demo-password"
    }
];

const TURN_FALLBACK_TIMEOUT_MS = 15000;

function shouldUseTurn(conn) {
    if (!conn || !conn.peerConnection) {
        return false;
    }

    const pc = conn.peerConnection;

    return (
        pc.iceConnectionState === "failed" ||
        pc.connectionState === "failed" ||
        pc.iceConnectionState === "disconnected"
    );
}

function setConnectionStatus(message, state = CONNECTION_STATES.idle) {
    status.textContent = message;
    status.dataset.state = state;
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
}

function scheduleConnectionRetry(id) {
    if (isManualDisconnect || !peer || !id) {
        return;
    }

    if (connectionRetryCount >= 4) {
        setConnectionStatus(
            `接続に失敗しました: ${id}`,
            CONNECTION_STATES.failed
        );
        addDebugLog(
            "接続再試行上限到達: " + id
        );
        return;
    }

    clearConnectionRetryTimer();
    connectionRetryCount += 1;
    connectionTargetId = id;

    setConnectionStatus(
        `接続を再試行しています (${connectionRetryCount}/4)...`,
        CONNECTION_STATES.connecting
    );

    addDebugLog(
        "接続再試行予定: " + id + " (" + connectionRetryCount + "/4)"
    );

    connectionRetryTimer = setTimeout(() => {
        if (!peer) {
            return;
        }

        connectToPeerId(id, true);
    }, 1500 * connectionRetryCount);
}

function connectToPeerId(id, isRetry = false) {
    if (!peer || !id) {
        return;
    }

    clearConnectionRetryTimer();
    connectionTargetId = id;

    if (!isRetry) {
        connectionRetryCount = 0;
    }

    setConnectionStatus(
        isRetry ?
            `再接続中... (${connectionRetryCount}/4)` :
            "相手に接続しています...",
        CONNECTION_STATES.connecting
    );

    addDebugLog(
        "接続開始: " + id + (isRetry ? " (retry)" : "")
    );

    updateDebugRemotePeer(id);
    startConnectionAttemptTimeout(id);

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
}

function startConnectionAttemptTimeout(id) {
    clearConnectionAttemptTimeout();

    connectionAttemptTimeout = setTimeout(() => {
        if (!connection || !connection.open) {
            setConnectionStatus(
                `相手との接続がタイムアウトしました: ${id}`,
                CONNECTION_STATES.failed
            );
            addDebugLog(
                "接続タイムアウト: " + id
            );

            if (connectionTargetId) {
                scheduleConnectionRetry(connectionTargetId);
            }
        }
    }, TURN_FALLBACK_TIMEOUT_MS);
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
            setConnectionStatus(
                "TURN経由への切り替えを試しています...",
                CONNECTION_STATES.connecting
            );
        }
    };

    pc.addEventListener("iceconnectionstatechange", monitor);
    pc.addEventListener("connectionstatechange", monitor);
}

function disconnectPeerConnection() {
    isManualDisconnect = true;
    clearConnectionAttemptTimeout();
    clearConnectionRetryTimer();

    if (connection && connection.close) {
        connection.close();
    }

    if (peer && peer.destroy) {
        peer.destroy();
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

