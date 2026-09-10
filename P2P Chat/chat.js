// ========================================
// 接続
// ========================================

function setupConnection(conn) {

    connection = conn;

    addDebugLog(
        "接続開始: " +
        conn.peer
    );

    if (
        typeof updateDebugConnection ===
        "function"
    ) {

        updateDebugConnection(
            conn
        );

    }


    // ========================================
    // 接続成功
    // ========================================

    conn.on(
        "open",
        () => {

            clearConnectionAttemptTimeout();
            setConnectionStatus(
                "接続しました",
                CONNECTION_STATES.connected
            );

            addSystemMessage(
                "接続しました"
            );

            addDebugLog(
                "DataConnection OPEN"
            );

            if (
                typeof updateDebugConnection ===
                "function"
            ) {

                updateDebugConnection(
                    conn
                );

            }

        }
    );

    if (conn.open) {

        clearConnectionAttemptTimeout();
        setConnectionStatus(
            "接続しました",
            CONNECTION_STATES.connected
        );

        addSystemMessage(
            "接続しました"
        );

    }


    // ========================================
    // データ受信
    // ========================================

    conn.on(
        "data",
        async data => {

            addDebugLog(
                "データ受信"
            );

            const normalized = normalizeIncomingEnvelope(data);
            const packet = normalized.legacy ? data : normalized.data;
            const packetPayload = packet && packet.payload ? packet.payload : packet;

            if (packet && packet.type === "file-chunk") {

                const isComplete =
                    await handleIncomingFileChunk(packet, conn);

                if (isComplete) {
                    addSystemMessage(
                        "ファイルを受信しました"
                    );
                }

                return;

            }

            if (packet && packet.type === "file-chunk-ack") {

                const transferState =
                    outgoingTransferState.get(packet.transferId);

                if (transferState) {
                    const chunkIndex = packet.chunkIndex;
                    transferState.ackedChunks.add(chunkIndex);

                    const timer =
                        transferState.retryTimers.get(chunkIndex);

                    if (timer) {
                        clearTimeout(timer);
                        transferState.retryTimers.delete(chunkIndex);
                    }

                    transferState.pendingChunks.delete(chunkIndex);

                    const percent =
                        (transferState.ackedChunks.size / transferState.totalChunks) * 100;

                    updateTransferProgress(
                        "送信中",
                        percent
                    );

                    addDebugLog(
                        "チャンクACK受信: " +
                        chunkIndex +
                        "/" +
                        transferState.totalChunks
                    );

                    if (
                        transferState.ackedChunks.size ===
                        transferState.totalChunks
                    ) {
                        outgoingTransferState.delete(packet.transferId);
                        hideTransferProgress();
                        addSystemMessage(
                            "ファイル送信を完了しました"
                        );
                    }
                }

                return;

            }

            if (packet && packet.type === "file-transfer-cancelled") {

                const transferId = packet.transferId;
                const fileName = packet.name || packetPayload?.name || "ファイル";

                incomingFileChunks.delete(transferId);
                hideTransferProgress();
                addSystemMessage(
                    "相手が送信を停止しました: " + fileName
                );
                addDebugLog(
                    "送信停止通知受信: " + transferId + " / " + fileName
                );

                return;

            }

            if (packet && packet.type === "file-chunk-request") {

                const transferState =
                    outgoingTransferState.get(packet.transferId);

                if (transferState && transferState.payloads) {
                    const payload =
                        transferState.payloads.get(packet.chunkIndex);

                    if (payload && conn && conn.open) {
                        safeSendToConnection(conn, payload);
                        addDebugLog(
                            "チャンク再送信: " +
                            packet.chunkIndex
                        );
                    }
                }

                return;

            }

            if (packet && packet.type === "text") {

                const text = packetPayload && typeof packetPayload.text === "string" ? packetPayload.text : packet.text;

                addMessage(
                    "相手: " +
                    text,
                    false
                );

                return;

            }

            if (packet && packet.type === "image") {

                addImageMessage(
                    packet.name || packetPayload?.name,
                    packetPayload && packetPayload.data ? packetPayload.data : packet.data,
                    false
                );

                addDebugLog(
                    "画像受信: " +
                    (packet.name || packetPayload?.name)
                );

                return;

            }

            if (packet && packet.type === "video") {

                addVideoMessage(
                    packet.name || packetPayload?.name,
                    packetPayload && packetPayload.data ? packetPayload.data : packet.data,
                    packet.mime || packetPayload?.mime,
                    false
                );

                addDebugLog(
                    "動画受信: " +
                    (packet.name || packetPayload?.name)
                );

                return;

            }

            if (packet && packet.type === "file") {

                addFileMessage(
                    packet.name || packetPayload?.name,
                    packetPayload && packetPayload.data ? packetPayload.data : packet.data,
                    packet.mime || packetPayload?.mime,
                    packet.size || packetPayload?.size,
                    false
                );

                addDebugLog(
                    "ファイル受信: " +
                    (packet.name || packetPayload?.name) +
                    " (" +
                    (packet.size || packetPayload?.size) +
                    " bytes)"
                );

                return;

            }

            if (
                typeof data === "string"
            ) {

                addMessage(
                    "相手: " +
                    data,
                    false
                );

                return;

            }

        }
    );


    // ========================================
    // 切断
    // ========================================

    conn.on(
        "close",
        () => {

            clearConnectionAttemptTimeout();
            setConnectionStatus(
                "接続が切断されました",
                CONNECTION_STATES.disconnected
            );

            addSystemMessage(
                "接続が切断されました"
            );

            addDebugLog(
                "DataConnection CLOSE"
            );

            if (!isManualDisconnect && connectionTargetId) {
                scheduleConnectionRetry(connectionTargetId);
            }

            connection = null;

        }
    );

    conn.on(
        "error",
        error => {

            console.error(
                "DataConnection error:",
                error
            );

            const errorMessage =
                error && error.message ? error.message : String(error);

            addSystemMessage(
                "接続エラーが発生しました"
            );

            addDebugLog(
                "DataConnection ERROR: " + errorMessage
            );

            showFailureAlert(
                "データ接続が壊れました。再接続を試します。",
                errorMessage
            );

            if (!isManualDisconnect && connectionTargetId) {
                scheduleConnectionRetry(connectionTargetId);
            }

        }
    );

}


// ========================================
// 添付ファイル
// ========================================

const FILE_CHUNK_SIZE = 512 * 1024;
const PROTOCOL_VERSION = 1;
const incomingFileChunks = new Map();
const outgoingTransferState = new Map();

let selectedFile = null;
let isTransmissionInProgress = false;

if (typeof window !== "undefined") {
    window.forceTransferCorruption = function(enabled = true) {
        if (typeof globalThis !== "undefined") {
            globalThis.__FORCE_TRANSFER_CORRUPTION__ = Boolean(enabled);
        }
        addSystemMessage(enabled ? "テスト: 次のファイル送信に破損を仕込みます" : "テスト: 破損仕込みを解除しました");
        return Boolean(enabled);
    };
    window.forceTransferFailure = function(enabled = true) {
        if (typeof globalThis !== "undefined") {
            globalThis.__FORCE_TRANSFER_FAILURE__ = Boolean(enabled);
        }
        addSystemMessage(enabled ? "テスト: 次の送信で失敗を強制します" : "テスト: 送信失敗強制を解除しました");
        return Boolean(enabled);
    };
}

function buildProtocolEnvelope(type, payload = {}, options = {}) {
    const envelope = {
        protocolVersion: PROTOCOL_VERSION,
        type,
        transferId: options.transferId || payload.transferId || null,
        chunkIndex: Number.isInteger(options.chunkIndex) ? options.chunkIndex : (
            Number.isInteger(payload.chunkIndex) ? payload.chunkIndex : null
        ),
        totalChunks: Number.isInteger(options.totalChunks) ? options.totalChunks : (
            Number.isInteger(payload.totalChunks) ? payload.totalChunks : null
        ),
        name: options.name || payload.name || null,
        mime: options.mime || payload.mime || "application/octet-stream",
        charset: options.charset || payload.charset || "utf-8",
        size: options.size ?? payload.size ?? null,
        fileHash: options.fileHash || payload.fileHash || null,
        chunkHash: options.chunkHash || payload.chunkHash || null,
        createdAt: Date.now(),
        payload: payload && typeof payload === "object" ? payload : { value: payload }
    };

    if (type === "text") {
        envelope.payload = {
            text: typeof payload.text === "string" ? payload.text : String(payload),
            charset: envelope.charset
        };
    }

    return envelope;
}

function normalizeIncomingEnvelope(data) {
    if (!data || typeof data !== "object") {
        return {
            legacy: true,
            data
        };
    }

    if (data.protocolVersion === PROTOCOL_VERSION && typeof data.type === "string") {
        return {
            legacy: false,
            data
        };
    }

    return {
        legacy: true,
        data
    };
}

function setSendControlsLocked(locked) {

    if (!sendButton || !attach) {
        return;
    }

    sendButton.disabled = locked;
    attach.disabled = locked;

}

function safeSendToConnection(conn, payload) {
    if (!conn || !conn.open) {
        if (attemptConnectionRecovery(conn)) {
            addDebugLog("DataChannel未開放時に自動復旧を試行しました");
        }
        showFailureAlert(
            "接続が閉じているため、データを送れませんでした。",
            "DataChannel not open"
        );
        return false;
    }

    try {
        conn.send(payload);
        return true;
    } catch (error) {
        console.error("DataChannel send failed:", error);
        addDebugLog("DataChannel send失敗: " + String(error));
        if (attemptConnectionRecovery(conn)) {
            addDebugLog("送信失敗後に自動復旧を試行しました");
        }
        showFailureAlert(
            "データ送信に失敗しました。相手との接続が壊れている可能性があります。",
            String(error)
        );
        return false;
    }
}

function cleanupTransferState(transferId) {
    if (transferId && outgoingTransferState.has(transferId)) {
        const transferState = outgoingTransferState.get(transferId);

        if (transferState && transferState.retryTimers) {
            transferState.retryTimers.forEach(timer => clearTimeout(timer));
        }

        outgoingTransferState.delete(transferId);
    }

    if (transferId) {
        incomingFileChunks.delete(transferId);
    }
}

async function computeSha256(buffer) {

    if (
        typeof crypto === "undefined" ||
        !crypto.subtle
    ) {
        throw new Error("Web Crypto API が利用できません");
    }

    const digest =
        await crypto.subtle.digest(
            "SHA-256",
            buffer
        );

    return Array.from(
        new Uint8Array(digest)
    ).map(
        byte => byte.toString(16).padStart(2, "0")
    ).join("");

}

function updateTransferProgress(label, percent) {

    if (!transferProgress) {
        return;
    }

    transferProgress.hidden = false;
    transferProgressLabel.textContent = label;
    transferProgressText.textContent = `${Math.max(0, Math.min(100, percent))}%`;
    transferProgressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;

}

function hideTransferProgress() {

    if (!transferProgress) {
        return;
    }

    transferProgress.hidden = true;
    transferProgressFill.style.width = "0%";
    transferProgressText.textContent = "0%";

}

async function sendFileInChunks(file, connection) {

    cancelTransferRequested = false;
    transferCancelReason = null;
    setCancelTransferButtonVisible(true);

    if (file.size > 2 * 1024 * 1024) {
        addSystemMessage(
            "大きいファイルを分割送信します..."
        );
    }

    const totalChunks =
        Math.ceil(
            file.size /
            FILE_CHUNK_SIZE
        );

    const fileHash =
        await computeSha256(
            await file.arrayBuffer()
        );

    const transferId =
        `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const transferState = {
        totalChunks,
        ackedChunks: new Set(),
        pendingChunks: new Map(),
        retryTimers: new Map(),
        payloads: new Map()
    };

    outgoingTransferState.set(
        transferId,
        transferState
    );

    updateTransferProgress(
        "送信中",
        0
    );

    try {

        for (
            let index = 0;
            index < totalChunks;
            index++
        ) {

            if (cancelTransferRequested) {
                throw new Error(
                    "transfer-cancelled"
                );
            }

            const start =
                index *
                FILE_CHUNK_SIZE;

            const end =
                Math.min(
                    start +
                    FILE_CHUNK_SIZE,
                    file.size
                );

            const chunk =
                file.slice(
                    start,
                    end
                );

            const chunkBuffer =
                await chunk.arrayBuffer();

            const chunkHash =
                await computeSha256(
                    chunkBuffer
                );

            const payload = buildProtocolEnvelope(
                "file-chunk",
                {
                    data: chunkBuffer,
                    name: file.name,
                    mime: file.type || "application/octet-stream",
                    size: file.size,
                    fileHash,
                    chunkHash,
                    transferId,
                    chunkIndex: index,
                    totalChunks
                },
                {
                    transferId,
                    chunkIndex: index,
                    totalChunks,
                    name: file.name,
                    mime: file.type || "application/octet-stream",
                    size: file.size,
                    fileHash,
                    chunkHash
                }
            );

            if (typeof globalThis !== "undefined" && globalThis.__FORCE_TRANSFER_CORRUPTION__) {
                const corruptedData = new Uint8Array(chunkBuffer.byteLength + 1);
                const original = new Uint8Array(chunkBuffer);
                corruptedData.set(original, 0);
                corruptedData[corruptedData.length - 1] = 0xFF;

                payload.payload.data = corruptedData.buffer;
                payload.payload.chunkHash = "corrupt-test-hash";
                payload.payload.fileHash = fileHash;
                payload.payload.name = file.name;
                payload.payload.size = file.size;

                addDebugLog("テスト用破損を挿入: transferId=" + transferId + ", chunkIndex=" + index);
                globalThis.__FORCE_TRANSFER_CORRUPTION__ = false;
            }

            if (typeof globalThis !== "undefined" && globalThis.__FORCE_TRANSFER_FAILURE__) {
                addDebugLog("テスト用送信失敗を強制: transferId=" + transferId + ", chunkIndex=" + index);
                globalThis.__FORCE_TRANSFER_FAILURE__ = false;
                throw new Error("forced-transfer-failure");
            }

            transferState.payloads.set(
                index,
                payload
            );

            transferState.pendingChunks.set(
                index,
                payload
            );

            const retryTimer =
                setTimeout(
                    () => {

                        const activeTransfer =
                            outgoingTransferState.get(
                                transferId
                            );

                        if (
                            !activeTransfer ||
                            activeTransfer.ackedChunks.has(
                                index
                            )
                        ) {
                            return;
                        }

                        if (
                            connection &&
                            connection.open
                        ) {

                            safeSendToConnection(connection, payload);

                            addDebugLog(
                                "チャンク再送信タイムアウト: " +
                                index +
                                "/" +
                                totalChunks
                            );

                        }

                    },
                    4000
                );

            transferState.retryTimers.set(
                index,
                retryTimer
            );

            safeSendToConnection(connection, payload);

            const percent =
                (
                    (index + 1) /
                    totalChunks
                ) * 100;

            updateTransferProgress(
                "送信中",
                percent
            );

            addDebugLog(
                "ファイルチャンク送信: " +
                file.name +
                " (" +
                (index + 1) +
                "/" +
                totalChunks +
                ")"
            );

        }

        addSystemMessage(
            "大きいファイルを分割送信しました: " +
            file.name
        );

    } catch (error) {

        if (
            error &&
            error.message ===
            "transfer-cancelled"
        ) {

            if (connection && connection.open) {
                safeSendToConnection(connection, buildProtocolEnvelope(
                    "file-transfer-cancelled",
                    {
                        name: file.name,
                        reason: "user-cancelled"
                    },
                    {
                        transferId,
                        name: file.name
                    }
                ));
            }

            addSystemMessage(
                "ファイル送信を停止しました: " +
                file.name
            );

            addDebugLog(
                "送信停止通知送信: " +
                transferId +
                " / " +
                file.name
            );

        } else {

            console.error(
                "ファイル送信エラー:",
                error
            );

            showFailureAlert(
                "ファイル送信が壊れました。送信を中断しました。",
                String(error)
            );

            addSystemMessage(
                "ファイル送信中にエラーが発生しました"
            );

        }

    } finally {

        cleanupTransferState(transferId);

        cancelTransferRequested =
            false;

        transferCancelReason =
            null;

        setCancelTransferButtonVisible(
            false
        );

        hideTransferProgress();

        // 添付ファイルをクリア
        selectedFile =
            null;

        fileInput.value =
            "";

    }

}

async function handleIncomingFileChunk(data, conn) {

    const transferId = data.transferId || data.payload?.transferId;
    const chunkIndex = data.chunkIndex ?? data.payload?.chunkIndex;
    const totalChunks = data.totalChunks ?? data.payload?.totalChunks;
    const actualPayload = data.payload && typeof data.payload === "object" ? data.payload : data;

    if (!transferId) {
        return false;
    }

    if (!incomingFileChunks.has(transferId)) {
        incomingFileChunks.set(transferId, {
            name: actualPayload.name || data.name,
            mime: actualPayload.mime || data.mime || "application/octet-stream",
            size: actualPayload.size || data.size,
            fileHash: actualPayload.fileHash || data.fileHash || null,
            totalChunks,
            chunks: new Map()
        });
    }

    const item = incomingFileChunks.get(transferId);
    const receivedChunk = new Uint8Array(actualPayload.data || data.data);
    const chunkHash = await computeSha256(receivedChunk.buffer);

    if (actualPayload.chunkHash && actualPayload.chunkHash !== chunkHash) {
        addSystemMessage(
            "チャンクの整合性チェックに失敗しました: " +
            actualPayload.name
        );

        if (attemptConnectionRecovery(conn)) {
            addDebugLog("ファイルチャンク破損時に接続自動復旧を試行しました");
        }
        
        if (conn && conn.open) {
            safeSendToConnection(conn, buildProtocolEnvelope(
                "file-chunk-request",
                {
                    reason: "hash-mismatch"
                },
                {
                    transferId,
                    chunkIndex,
                    mime: "application/octet-stream"
                }
            ));
        }

        incomingFileChunks.delete(transferId);
        return false;
    }

    item.chunks.set(chunkIndex, receivedChunk);

    if (conn && conn.open) {
        safeSendToConnection(conn, buildProtocolEnvelope(
            "file-chunk-ack",
            {},
            {
                transferId,
                chunkIndex,
                totalChunks
            }
        ));
    }

    const percent =
        (item.chunks.size / totalChunks) * 100;

    updateTransferProgress(
        "受信中",
        percent
    );

    addDebugLog(
        "受信チャンク: " +
        (item.chunks.size) +
        "/" +
        totalChunks +
        " (" +
        data.name +
        ")"
    );

    if (item.chunks.size !== totalChunks) {
        return false;
    }

    const orderedChunks =
        Array.from(
            { length: totalChunks },
            (_, index) => {
                return item.chunks.get(index) || null;
            }
        ).filter(Boolean);

    if (orderedChunks.length !== totalChunks) {
        incomingFileChunks.delete(transferId);
        return false;
    }

    const combinedBlob =
        new Blob(
            orderedChunks,
            {
                type: item.mime
            }
        );

    const combinedBuffer =
        await combinedBlob.arrayBuffer();

    if (item.fileHash) {
        const finalHash =
            await computeSha256(combinedBuffer);

        if (item.fileHash !== finalHash) {
            addSystemMessage(
                "ファイルの整合性チェックに失敗しました: " +
                item.name
            );
            incomingFileChunks.delete(transferId);
            hideTransferProgress();
            return false;
        }
    }

    const isVideoFile =
        typeof item.mime === "string" &&
        item.mime.startsWith("video/");

    if (isVideoFile) {
        const videoUrl =
            URL.createObjectURL(
                new Blob(
                    [combinedBuffer],
                    {
                        type: item.mime
                    }
                )
            );

        addVideoMessage(
            item.name,
            videoUrl,
            item.mime,
            false
        );
    } else {
        addFileMessage(
            item.name,
            combinedBuffer,
            item.mime,
            item.size,
            false
        );
    }

    hideTransferProgress();
    incomingFileChunks.delete(transferId);

    return true;

}


fileInput.addEventListener(
    "change",
    () => {

        selectedFile =
            fileInput.files[0] ||
            null;

        if (!selectedFile) {
            return;
        }

        addSystemMessage(
            "添付: " +
            selectedFile.name
        );

        addDebugLog(
            "添付選択: " +
            selectedFile.name
        );

    }
);


// ========================================
// 添付ボタン
// ========================================

attach.addEventListener(
    "click",
    () => {

        fileInput.click();

    }
);


// ========================================
// 送信ボタン
// ========================================

sendButton.addEventListener(
    "click",
    async () => {

        if (isTransmissionInProgress) {
            addSystemMessage(
                "送信中です。少し待ってから再度お試しください"
            );
            return;
        }

        if (
            !connection ||
            !connection.open
        ) {

            addSystemMessage(
                "まだ接続されていません"
            );

            return;

        }

        isTransmissionInProgress = true;
        setSendControlsLocked(true);
        setCancelTransferButtonVisible(Boolean(selectedFile));

        try {

            // ====================================
            // 添付ファイル送信
            // ====================================

            if (selectedFile) {

            const file =
                selectedFile;


            // ==================================
            // 画像
            // ==================================

            if (
                file.type.startsWith(
                    "image/"
                )
            ) {

                if (
                    file.size >
                    2 * 1024 * 1024
                ) {

                    addSystemMessage(
                        "画像は2MB以下にしてください"
                    );

                    return;

                }


                try {

                    const reader =
                        new FileReader();


                    reader.onload = () => {

                        safeSendToConnection(connection, {

                            type:
                                "image",

                            name:
                                file.name,

                            mime:
                                file.type,

                            data:
                                reader.result

                        });


                        addImageMessage(
                            file.name,
                            reader.result,
                            true
                        );


                        addDebugLog(
                            "画像送信: " +
                            file.name
                        );


                        selectedFile =
                            null;

                        fileInput.value =
                            "";

                    };


                    reader.onerror = () => {

                        addSystemMessage(
                            "画像の読み込みに失敗しました"
                        );

                    };


                    reader.readAsDataURL(
                        file
                    );

                } catch (error) {

                    console.error(
                        "画像送信エラー:",
                        error
                    );

                    addSystemMessage(
                        "画像の送信に失敗しました"
                    );

                }

                return;

            }


            // ==================================
            // 動画
            // ==================================

            if (
                file.type.startsWith(
                    "video/"
                )
            ) {

                try {
                    await sendFileInChunks(
                        file,
                        connection
                    );

                    addDebugLog(
                        "動画送信: " +
                        file.name
                    );

                    return;

                } catch (error) {

                    console.error(
                        "動画送信エラー:",
                        error
                    );

                    addSystemMessage(
                        "動画の送信に失敗しました"
                    );

                }

                return;

            }


            // ==================================
            // 通常ファイル
            // ==================================

            try {

                if (
                    file.size >
                    2 * 1024 * 1024
                ) {

                    await sendFileInChunks(
                        file,
                        connection
                    );

                    return;

                }

                addDebugLog(
                    "ファイル読み込み中: " +
                    file.name
                );


                const data =
                    await file.arrayBuffer();


                safeSendToConnection(connection, buildProtocolEnvelope(
                    "file",
                    {
                        name: file.name,
                        mime: file.type || "application/octet-stream",
                        size: file.size,
                        data: data
                    },
                    {
                        name: file.name,
                        mime: file.type || "application/octet-stream",
                        size: file.size
                    }
                ));


                addFileMessage(
                    file.name,
                    data,
                    file.type,
                    file.size,
                    true
                );


                addDebugLog(
                    "ファイル送信: " +
                    file.name +
                    " (" +
                    file.size +
                    " bytes)"
                );


                selectedFile =
                    null;

                fileInput.value =
                    "";

            } catch (error) {

                console.error(
                    "ファイル送信エラー:",
                    error
                );

                addSystemMessage(
                    "ファイルの読み込みに失敗しました"
                );

                addDebugLog(
                    "ファイル送信 ERROR"
                );

            }

                return;

            }


            // ====================================
            // テキスト送信
            // ====================================

            const message =
                messageInput.value.trim();


            if (!message) {
                return;
            }


            safeSendToConnection(connection, buildProtocolEnvelope(
                "text",
                {
                    text: message,
                    charset: "utf-8"
                },
                {
                    charset: "utf-8"
                }
            ));


            addMessage(
                "自分: " +
                message.replace(/\n/g, "\n"),
                true
            );


            messageInput.value =
                "";

        } finally {

            isTransmissionInProgress = false;
            setSendControlsLocked(false);
            setCancelTransferButtonVisible(false);
            cancelTransferRequested = false;
            transferCancelReason = null;

        }

    }
);


// ========================================
// Enterキー
// ========================================

messageInput.addEventListener(
    "input",
    () => {

        messageInput.style.height = "auto";
        const maxHeight = 180;
        const nextHeight = Math.min(
            messageInput.scrollHeight,
            maxHeight
        );

        messageInput.style.height = `${nextHeight}px`;
        messageInput.style.overflowY =
            nextHeight >= maxHeight ? "auto" : "hidden";

    }
);

messageInput.addEventListener(
    "keydown",
    event => {

        if (
            event.key !==
            "Enter"
        ) {

            return;

        }

        if (isTransmissionInProgress) {
            return;
        }

        if (event.shiftKey) {
            return;
        }


        event.preventDefault();


        // ====================================
        // 添付ファイルがある場合
        // ====================================

        if (selectedFile) {

            addSystemMessage(
                "添付ファイルがあります。送信ボタンを押してください"
            );

            return;

        }


        // ====================================
        // テキスト送信
        // ====================================

        sendButton.click();

    }
);


// ========================================
// テキストメッセージ表示
// ========================================

function addMessage(
    text,
    self = false
) {

    const message =
        document.createElement(
            "div"
        );

    message.className =
        "message";


    if (self) {

        message.classList.add(
            "self"
        );

    }


    message.textContent =
        text;

    message.style.whiteSpace = "pre-wrap";


    messages.appendChild(
        message
    );


    messages.scrollTop =
        messages.scrollHeight;

}


// ========================================
// システムメッセージ
// ========================================

function addSystemMessage(
    text
) {

    const message =
        document.createElement(
            "div"
        );

    message.className =
        "system-message";


    message.textContent =
        text;

    message.style.whiteSpace = "pre-wrap";


    messages.appendChild(
        message
    );


    messages.scrollTop =
        messages.scrollHeight;

}


// ========================================
// 画像表示
// ========================================

function addImageMessage(
    name,
    data,
    self = false
) {

    const container =
        document.createElement(
            "div"
        );

    container.className =
        "image-message";


    if (self) {

        container.classList.add(
            "self"
        );

    }


    const label =
        document.createElement(
            "p"
        );


    label.textContent =
        self
            ? "自分: " + name
            : "相手: " + name;


    const image =
        document.createElement(
            "img"
        );


    image.src =
        data;


    image.alt =
        name;


    image.loading =
        "lazy";


    // ====================================
    // 画像クリック
    // ====================================

    image.addEventListener(
        "click",
        () => {

            const overlay =
                document.createElement(
                    "div"
                );

            overlay.className =
                "image-overlay";
            overlay.setAttribute(
                "role",
                "dialog"
            );
            overlay.setAttribute(
                "aria-label",
                "画像拡大表示"
            );

            const enlarged =
                document.createElement(
                    "img"
                );

            enlarged.src =
                data;
            enlarged.alt =
                name;
            enlarged.loading =
                "eager";
            enlarged.style.display =
                "block";
            enlarged.style.maxWidth =
                "90vw";
            enlarged.style.maxHeight =
                "90vh";
            enlarged.style.objectFit =
                "contain";
            enlarged.style.borderRadius =
                "8px";
            enlarged.style.boxShadow =
                "0 12px 40px rgba(0, 0, 0, 0.35)";

            const close =
                document.createElement(
                    "button"
                );

            close.type =
                "button";
            close.className =
                "image-close";
            close.textContent =
                "×";

            close.addEventListener(
                "click",
                (event) => {
                    event.stopPropagation();
                    overlay.remove();
                }
            );

            overlay.addEventListener(
                "click",
                (event) => {
                    if (event.target === overlay) {
                        overlay.remove();
                    }
                }
            );

            overlay.appendChild(
                enlarged
            );
            overlay.appendChild(
                close
            );

            document.body.appendChild(
                overlay
            );

        }
    );


    container.appendChild(
        label
    );

    container.appendChild(
        image
    );


    messages.appendChild(
        container
    );


    messages.scrollTop =
        messages.scrollHeight;

}


// ========================================
// 動画表示
// ========================================

function addVideoMessage(
    name,
    data,
    mime = "video/mp4",
    self = false
) {

    const container =
        document.createElement(
            "div"
        );

    container.className =
        "video-message";

    if (self) {
        container.classList.add(
            "self"
        );
    }

    const label =
        document.createElement(
            "p"
        );

    label.textContent =
        self
            ? "自分: " + name
            : "相手: " + name;

    const video =
        document.createElement(
            "video"
        );

    video.src = data;
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.style.maxWidth = "420px";
    video.style.maxHeight = "320px";
    video.style.width = "100%";
    video.style.borderRadius = "10px";
    video.style.background = "#000";
    video.style.display = "block";

    const info =
        document.createElement(
            "p"
        );

    info.textContent =
        mime || "video/mp4";
    info.style.fontSize = "12px";
    info.style.color = "#666";
    info.style.margin = "6px 0 0";

    container.appendChild(
        label
    );
    container.appendChild(
        video
    );
    container.appendChild(
        info
    );

    messages.appendChild(
        container
    );
    messages.scrollTop =
        messages.scrollHeight;

}


// ========================================
// ファイル表示
// ========================================

function addFileMessage(
    name,
    data,
    mime,
    size,
    self = false
) {

    const container =
        document.createElement(
            "div"
        );

    container.className =
        "file-message";


    if (self) {

        container.classList.add(
            "self"
        );

    }


    // ====================================
    // ファイル名
    // ====================================

    const label =
        document.createElement(
            "p"
        );


    label.textContent =
        self
            ? "自分: " + name
            : "相手: " + name;


    // ====================================
    // サイズ
    // ====================================

    const info =
        document.createElement(
            "p"
        );


    info.textContent =
        "サイズ: " +
        size +
        " bytes";


    // ====================================
    // Blob
    // ====================================

    const blob =
        new Blob(
            [data],
            {
                type:
                    mime ||
                    "application/octet-stream"
            }
        );


    const url =
        URL.createObjectURL(
            blob
        );


    const isTextFile =
        typeof mime === "string" &&
        (
            mime.startsWith("text/") ||
            mime.includes("json") ||
            mime.includes("javascript") ||
            mime.includes("xml") ||
            name.toLowerCase().endsWith(".txt") ||
            name.toLowerCase().endsWith(".csv") ||
            name.toLowerCase().endsWith(".md") ||
            name.toLowerCase().endsWith(".log") ||
            name.toLowerCase().endsWith(".json")
        );


    // ====================================
    // 音声判定
    // ====================================

    const isAudio =
        mime &&
        mime.startsWith(
            "audio/"
        );


    let audio = null;


    if (isAudio) {

        audio =
            document.createElement(
                "audio"
            );


        audio.controls =
            true;


        audio.preload =
            "metadata";


        audio.src =
            url;

    }


    const previewButton =
        document.createElement(
            "button"
        );


    previewButton.type =
        "button";
    previewButton.textContent =
        "📄 内容を見る";


    if (isTextFile && size <= 2 * 1024 * 1024) {

        previewButton.addEventListener(
            "click",
            () => {

                const decoder =
                    new TextDecoder(
                        "utf-8"
                    );

                const text =
                    decoder.decode(
                        data
                    );

                const preview =
                    document.createElement(
                        "pre"
                    );

                preview.textContent =
                    text;

                const overlay =
                    document.createElement(
                        "div"
                    );

                overlay.className =
                    "image-overlay";

                overlay.style.background =
                    "rgba(0, 0, 0, 0.8)";

                const close =
                    document.createElement(
                        "button"
                    );

                close.type =
                    "button";
                close.className =
                    "image-close";
                close.textContent =
                    "×";

                close.addEventListener(
                    "click",
                    () => {
                        overlay.remove();
                    }
                );

                overlay.addEventListener(
                    "click",
                    (event) => {
                        if (event.target === overlay) {
                            overlay.remove();
                        }
                    }
                );

                preview.style.width =
                    "min(90vw, 900px)";
                preview.style.maxHeight =
                    "80vh";
                preview.style.whiteSpace =
                    "pre-wrap";
                preview.style.wordBreak =
                    "break-word";
                preview.style.padding =
                    "20px";
                preview.style.borderRadius =
                    "8px";
                preview.style.background =
                    "#ffffff";
                preview.style.color =
                    "#111";
                preview.style.overflow =
                    "auto";
                preview.style.boxSizing =
                    "border-box";

                overlay.appendChild(
                    preview
                );
                overlay.appendChild(
                    close
                );

                document.body.appendChild(
                    overlay
                );

            }
        );

    } else {

        previewButton.disabled =
            true;
        previewButton.style.opacity =
            "0.5";
        previewButton.title =
            "テキストファイルのみプレビュー可能です";

    }


    // ====================================
    // ダウンロード
    // ====================================

    const download =
        document.createElement(
            "a"
        );


    download.href =
        url;


    download.download =
        name;


    download.textContent =
        "📥 ダウンロード";


    // ====================================
    // 表示
    // ====================================

    container.appendChild(
        label
    );


    container.appendChild(
        info
    );


    if (audio) {

        container.appendChild(
            audio
        );

    }

    if (isTextFile && size <= 2 * 1024 * 1024) {

        container.appendChild(
            previewButton
        );

    }


    container.appendChild(
        download
    );


    messages.appendChild(
        container
    );


    messages.scrollTop =
        messages.scrollHeight;

}
