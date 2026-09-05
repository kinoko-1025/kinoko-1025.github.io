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

            if (
                data &&
                data.type === "file-chunk"
            ) {

                const isComplete =
                    await handleIncomingFileChunk(data, conn);

                if (isComplete) {
                    addSystemMessage(
                        "ファイルを受信しました"
                    );
                }

                return;

            }

            if (
                data &&
                data.type === "file-chunk-ack"
            ) {

                const transferState =
                    outgoingTransferState.get(data.transferId);

                if (transferState) {
                    transferState.ackedChunks.add(data.chunkIndex);

                    const timer =
                        transferState.retryTimers.get(data.chunkIndex);

                    if (timer) {
                        clearTimeout(timer);
                        transferState.retryTimers.delete(data.chunkIndex);
                    }

                    transferState.pendingChunks.delete(data.chunkIndex);

                    const percent =
                        (transferState.ackedChunks.size / transferState.totalChunks) * 100;

                    updateTransferProgress(
                        "送信中",
                        percent
                    );

                    addDebugLog(
                        "チャンクACK受信: " +
                        data.chunkIndex +
                        "/" +
                        transferState.totalChunks
                    );

                    if (
                        transferState.ackedChunks.size ===
                        transferState.totalChunks
                    ) {
                        outgoingTransferState.delete(data.transferId);
                        hideTransferProgress();
                        addSystemMessage(
                            "ファイル送信を完了しました"
                        );
                    }
                }

                return;

            }

            if (
                data &&
                data.type === "file-chunk-request"
            ) {

                const transferState =
                    outgoingTransferState.get(data.transferId);

                if (transferState && transferState.payloads) {
                    const payload =
                        transferState.payloads.get(data.chunkIndex);

                    if (payload && conn && conn.open) {
                        conn.send(payload);
                        addDebugLog(
                            "チャンク再送信: " +
                            data.chunkIndex
                        );
                    }
                }

                return;

            }


            // ====================================
            // テキスト
            // ====================================

            if (
                data &&
                data.type === "text"
            ) {

                addMessage(
                    "相手: " +
                    data.text,
                    false
                );

                return;

            }


            // ====================================
            // 画像
            // ====================================

            if (
                data &&
                data.type === "image"
            ) {

                addImageMessage(
                    data.name,
                    data.data,
                    false
                );

                addDebugLog(
                    "画像受信: " +
                    data.name
                );

                return;

            }


            // ====================================
            // ファイル
            // ====================================

            if (
                data &&
                data.type === "file"
            ) {

                addFileMessage(
                    data.name,
                    data.data,
                    data.mime,
                    data.size,
                    false
                );

                addDebugLog(
                    "ファイル受信: " +
                    data.name +
                    " (" +
                    data.size +
                    " bytes)"
                );

                return;

            }


            // ====================================
            // 古い形式の文字列
            // ====================================

            if (
                typeof data ===
                "string"
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

            connection = null;

            if (connectionTargetId) {
                scheduleConnectionRetry(connectionTargetId);
            }

            console.error(
                "DataConnection error:",
                error
            );

            addSystemMessage(
                "接続エラーが発生しました"
            );

            addDebugLog(
                "DataConnection ERROR"
            );

        }
    );

}


// ========================================
// 添付ファイル
// ========================================

const FILE_CHUNK_SIZE = 512 * 1024;
const incomingFileChunks = new Map();
const outgoingTransferState = new Map();

let selectedFile = null;
let isTransmissionInProgress = false;

function setSendControlsLocked(locked) {

    if (!sendButton || !attach) {
        return;
    }

    sendButton.disabled = locked;
    attach.disabled = locked;

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

    outgoingTransferState.set(transferId, transferState);
    updateTransferProgress("送信中", 0);

    for (let index = 0; index < totalChunks; index++) {

        const start =
            index * FILE_CHUNK_SIZE;

        const end =
            Math.min(
                start + FILE_CHUNK_SIZE,
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
            await computeSha256(chunkBuffer);

        const payload = {
            type: "file-chunk",
            transferId,
            chunkIndex: index,
            totalChunks,
            name: file.name,
            mime: file.type || "application/octet-stream",
            size: file.size,
            fileHash,
            chunkHash,
            data: chunkBuffer
        };

        transferState.payloads.set(index, payload);
        transferState.pendingChunks.set(index, payload);

        const retryTimer = setTimeout(() => {
            const activeTransfer = outgoingTransferState.get(transferId);

            if (!activeTransfer || activeTransfer.ackedChunks.has(index)) {
                return;
            }

            if (connection && connection.open) {
                connection.send(payload);
                addDebugLog(
                    "チャンク再送信タイムアウト: " +
                    index +
                    "/" +
                    totalChunks
                );
            }
        }, 4000);

        transferState.retryTimers.set(index, retryTimer);
        connection.send(payload);

        const percent =
            ((index + 1) / totalChunks) * 100;

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

    hideTransferProgress();

    addSystemMessage(
        "大きいファイルを分割送信しました: " + file.name
    );

}

async function handleIncomingFileChunk(data, conn) {

    const transferId = data.transferId;
    const chunkIndex = data.chunkIndex;
    const totalChunks = data.totalChunks;

    if (!transferId) {
        return false;
    }

    if (!incomingFileChunks.has(transferId)) {
        incomingFileChunks.set(transferId, {
            name: data.name,
            mime: data.mime || "application/octet-stream",
            size: data.size,
            fileHash: data.fileHash || null,
            totalChunks,
            chunks: new Map()
        });
    }

    const item = incomingFileChunks.get(transferId);
    const receivedChunk = new Uint8Array(data.data);
    const chunkHash = await computeSha256(receivedChunk.buffer);

    if (data.chunkHash && data.chunkHash !== chunkHash) {
        addSystemMessage(
            "チャンクの整合性チェックに失敗しました: " +
            data.name
        );

        if (conn && conn.open) {
            conn.send({
                type: "file-chunk-request",
                transferId,
                chunkIndex,
                reason: "hash-mismatch"
            });
        }

        incomingFileChunks.delete(transferId);
        return false;
    }

    item.chunks.set(chunkIndex, receivedChunk);

    if (conn && conn.open) {
        conn.send({
            type: "file-chunk-ack",
            transferId,
            chunkIndex,
            totalChunks
        });
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

    addFileMessage(
        item.name,
        combinedBuffer,
        item.mime,
        item.size,
        false
    );

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

                        connection.send({

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


                connection.send({

                    type:
                        "file",

                    name:
                        file.name,

                    mime:
                        file.type ||
                        "application/octet-stream",

                    size:
                        file.size,

                    data:
                        data

                });


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


            connection.send({

                type:
                    "text",

                text:
                    message

            });


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