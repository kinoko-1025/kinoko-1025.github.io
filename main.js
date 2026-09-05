// ========================================
// P2P Chat
// main.js
// ========================================

alert("main.js 読み込み成功");

// ========================================
// DOM
// ========================================

const myId = document.getElementById("my-id");
const peerIdInput = document.getElementById("peer-id");
const connectButton = document.getElementById("connect");
const status = document.getElementById("status");

const messageInput = document.getElementById("message");
const imageInput = document.getElementById("image");
const sendButton = document.getElementById("send");
const fileInput = document.getElementById("file");
const fileSendButton = document.getElementById("file-send");

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

const debugHost =
    document.getElementById("debug-host");

const debugSrflx =
    document.getElementById("debug-srflx");

const debugRelay =
    document.getElementById("debug-relay");

const debugLocalCandidate =
    document.getElementById("debug-local-candidate");

const debugRemoteCandidate =
    document.getElementById("debug-remote-candidate");

const debugRemotePeer =
    document.getElementById("debug-remote-peer");

const debugLog =
    document.getElementById("debug-log");

// ========================================
// 接続状態
// ========================================

let connection = null;
let peer = null;

// ========================================
// 起動
// ========================================

