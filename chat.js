alert("chat.js 読み込み成功");


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


    // ========================================
    // データ受信
    // ========================================

    conn.on(
        "data",
        data => {

            addDebugLog(
                "データ受信"
            );


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

            addSystemMessage(
                "接続が切断されました"
            );

            addDebugLog(
                "DataConnection CLOSE"
            );

        }
    );


    // ========================================
    // エラー
    // ========================================

    conn.on(
        "error",
        error => {

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

let selectedFile = null;


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

        if (
            !connection ||
            !connection.open
        ) {

            addSystemMessage(
                "まだ接続されていません"
            );

            return;

        }


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
            message,
            true
        );


        messageInput.value =
            "";

    }
);


// ========================================
// Enterキー
// ========================================

messageInput.addEventListener(
    "keydown",
    event => {

        if (
            event.key !==
            "Enter"
        ) {

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


            const enlarged =
                document.createElement(
                    "img"
                );

            enlarged.src =
                data;

            enlarged.alt =
                name;


            const close =
                document.createElement(
                    "button"
                );

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


    container.appendChild(
        download
    );


    messages.appendChild(
        container
    );


    messages.scrollTop =
        messages.scrollHeight;

}