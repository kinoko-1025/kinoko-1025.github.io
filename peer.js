// ========================================
// PeerJS
// ========================================

startPeer();

async function startPeer() {

    if (peer) {
        return peer;
    }

    if (peerInitPromise) {
        return peerInitPromise;
    }

    peerInitPromise = (async () => {

        try {

            isManualDisconnect = false;

            updateDebugPeerStatus(
                "PeerJS読み込み中"
            );

            addDebugLog(
                "PeerJS読み込み開始"
            );

            setConnectionStatus(
                "PeerJSを読み込んでいます...",
                CONNECTION_STATES.connecting
            );

            const peerjs =
                await import(
                    "https://esm.sh/peerjs"
                );

            const Peer =
                peerjs.Peer;

            addDebugLog(
                "PeerJS読み込み成功"
            );

            status.textContent =
                "PeerServerに接続しています...";

            peer =
                new Peer({
                    debug: 0,
                    config: {
                        iceServers: ICE_SERVERS
                    }
                });

            addDebugLog("Peerインスタンス作成完了");

            updateDebugPeerStatus(
                "接続中"
            );

            addDebugLog(
                "Peer作成"
            );

            // ========================================
            // Peer ID
            // ========================================

            peer.on(
                "open",
                id => {

                    console.log(
                        "自分のPeer ID:",
                        id
                    );

                    myId.textContent =
                        id;

                    updateDebugPeerId(id);

                    updateDebugPeerStatus(
                        "接続済み"
                    );

                    setConnectionStatus(
                        "PeerServerに接続しました",
                        CONNECTION_STATES.connected
                    );

                    addDebugLog(
                        "Peer ID取得成功: " + id
                    );

                }
            );

            // ========================================
            // 相手から接続
            // ========================================

            peer.on(
                "connection",
                conn => {

                    console.log(
                        "相手から接続要求:",
                        conn.peer
                    );

                    addDebugLog(
                        "相手から接続要求: " +
                        conn.peer
                    );

                    connection =
                        conn;

                    clearConnectionAttemptTimeout();

                    updateDebugRemotePeer(
                        conn.peer
                    );

                    setupTurnFallback(conn);
                    setupConnection(conn);
                    registerConnectionHealthMonitor(conn);

                }
            );

            // ========================================
            // Peerエラー
            // ========================================

            peer.on(
                "error",
                error => {

                    console.error(
                        "PeerJS Error:",
                        error
                    );

                    updateDebugPeerStatus(
                        "エラー"
                    );

                    markConnectionFailure(
                        "PeerJSエラー: " + error.type,
                        "PeerJS ERROR: " + error.type
                    );
                    attemptPeerRecovery("PeerJS ERROR: " + error.type).catch(error => {
                        addDebugLog("Peer自動復旧失敗: " + String(error));
                    });
                    showFailureAlert(
                        "PeerJS 接続が壊れました。再読み込みしてやり直してください。",
                        "PeerJS ERROR: " + error.type
                    );

                }
            );

            // ========================================
            // Peer切断
            // ========================================

            peer.on(
                "disconnected",
                () => {

                    updateDebugPeerStatus(
                        "切断"
                    );

                    setConnectionStatus(
                        "PeerServerから切断されました",
                        CONNECTION_STATES.disconnected
                    );

                    addDebugLog(
                        "PeerServerから切断"
                    );

                    addSystemMessage(
                        "PeerServerとの接続が切断されました。再接続をお試しください。"
                    );

                    if (!isManualDisconnect && connectionTargetId) {
                        scheduleConnectionRetry(connectionTargetId);
                    }

                }
            );

            // ========================================
            // Peer終了
            // ========================================

            peer.on(
                "close",
                () => {

                    updateDebugPeerStatus(
                        "終了"
                    );

                    setConnectionStatus(
                        "Peer接続終了",
                        CONNECTION_STATES.disconnected
                    );

                    addDebugLog(
                        "Peer終了"
                    );

                    if (!isManualDisconnect && connectionTargetId) {
                        scheduleConnectionRetry(connectionTargetId);
                    }

                    peer = null;
                    peerInitPromise = null;
                    resetConnectionState();

                }
            );

            return peer;

        } catch (error) {

            console.error(
                "PeerJS読み込みエラー:",
                error
            );

            myId.textContent =
                "エラー";

            updateDebugPeerStatus(
                "読み込み失敗"
            );

            setConnectionStatus(
                "PeerJS読み込み失敗",
                CONNECTION_STATES.failed
            );

            addDebugLog(
                "PeerJS読み込み失敗"
            );

            addSystemMessage(
                "PeerJSの読み込みに失敗しました"
            );

            peer = null;
            peerInitPromise = null;

            throw error;

        }

    })();

    try {
        return await peerInitPromise;
    } finally {
        peerInitPromise = null;
    }

}

// ========================================
// 相手へ接続
// ========================================

connectButton.addEventListener(
    "click",
    async () => {

        if (!peer) {
            setConnectionStatus(
                "PeerJSを再初期化しています...",
                CONNECTION_STATES.connecting
            );

            try {
                await startPeer();
            } catch (error) {
                addDebugLog(
                    "Peer再初期化失敗: " + String(error)
                );
                return;
            }
        }

        const id =
            peerIdInput.value.trim();

        if (!id) {

            setConnectionStatus(
                "相手のPeer IDを入力してください",
                CONNECTION_STATES.failed
            );

            return;

        }

        isManualDisconnect = false;
        clearConnectionRetryTimer();
        clearConnectionAttemptTimeout();
        connectionRetryScheduled = false;
        connectionTargetId = id;

        connectToPeerId(id, false);

    }
);

reconnectButton.addEventListener(
    "click",
    async () => {

        const id =
            peerIdInput.value.trim();

        if (!id) {
            setConnectionStatus(
                "相手のPeer IDを入力してください",
                CONNECTION_STATES.failed
            );
            return;
        }

        isManualDisconnect = false;
        connectionRetryCount = 0;
        connectionRetryScheduled = false;
        clearConnectionRetryTimer();
        clearConnectionAttemptTimeout();

        if (!peer) {
            try {
                await startPeer();
            } catch (error) {
                addDebugLog(
                    "再接続準備失敗: " + String(error)
                );
                return;
            }
        }

        connectionTargetId = id;
        connectToPeerId(id, false);

    }
);

disconnectButton.addEventListener(
    "click",
    () => {
        disconnectPeerConnection();
    }
);
