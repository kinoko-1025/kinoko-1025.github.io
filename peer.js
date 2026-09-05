// ========================================
// PeerJS
// ========================================

alert("peer.js 読み込み成功");

alert("startPeer直前");
startPeer();

async function startPeer() {

    try {

        updateDebugPeerStatus(
            "PeerJS読み込み中"
        );

        addDebugLog(
            "PeerJS読み込み開始"
        );

        status.textContent =
            "PeerJSを読み込んでいます...";

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
            new Peer();

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

                status.textContent =
                    "PeerServerに接続しました";

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

                updateDebugRemotePeer(
                    conn.peer
                );

                setupConnection(conn);

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

                status.textContent =
                    "PeerJSエラー: " +
                    error.type;

                addDebugLog(
                    "PeerJS ERROR: " +
                    error.type
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

                status.textContent =
                    "PeerServerから切断されました";

                addDebugLog(
                    "PeerServerから切断"
                );

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

                status.textContent =
                    "Peer接続終了";

                addDebugLog(
                    "Peer終了"
                );

            }
        );

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

        status.textContent =
            "PeerJS読み込み失敗";

        addDebugLog(
            "PeerJS読み込み失敗"
        );

        addSystemMessage(
            "PeerJSの読み込みに失敗しました"
        );

    }

}

// ========================================
// 相手へ接続
// ========================================

connectButton.addEventListener(
    "click",
    () => {

        if (!peer) {

            status.textContent =
                "PeerJSがまだ準備できていません";

            return;

        }

        const id =
            peerIdInput.value.trim();

        if (!id) {

            status.textContent =
                "相手のPeer IDを入力してください";

            return;

        }

        status.textContent =
            "相手に接続しています...";

        addDebugLog(
            "接続開始: " + id
        );

        updateDebugRemotePeer(id);

        const conn =
            peer.connect(id);

        connection =
            conn;

        setupConnection(conn);

    }
);