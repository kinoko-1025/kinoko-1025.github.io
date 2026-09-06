const NETWORK_STRATEGY = {
    mode: "stun-first-fallback",
    phases: [
        "stun-check",
        "ice-retry",
        "turn-retry",
        "relay-fallback",
        "user-notification"
    ]
};

function evaluateConnectionFailureReason({
    iceState,
    connectionState,
    candidateTypes,
    retryCount,
    turnConfigured
}) {
    if (!iceState && retryCount === 0) {
        return "stun-not-yet-tested";
    }

    if (iceState === "failed" || connectionState === "failed") {
        if (turnConfigured) {
            return "turn-needed";
        }

        return "nat-or-firewall-blocked";
    }

    if (candidateTypes && candidateTypes.includes("relay")) {
        return "relay-route-used";
    }

    if (retryCount >= 3) {
        return "retry-limit-reached";
    }

    return "unknown-connection-problem";
}

const FALLBACK_STRATEGY = {
    stun: {
        description: "まず STUN で外部候補を確保し、P2P 接続を試す",
        goal: "direct-connection"
    },
    turn: {
        description: "STUN で繋がらない場合、TURN を使って relayed 接続を試す",
        goal: "reliable-relay"
    },
    relayServer: {
        description: "TURN も使えない場合は、WebSocket などの中継サーバーに切り替える",
        goal: "fallback-transport"
    },
    notifyUser: {
        description: "接続失敗の理由と次のアクションをユーザーに知らせる",
        goal: "user-awareness"
    }
};

function getFallbackPlan({
    retryCount,
    turnConfigured,
    hasRelayCandidate,
    iceState,
    connectionState
}) {
    if (retryCount === 0) {
        return "stun-check";
    }

    if (iceState === "failed" || connectionState === "failed") {
        if (turnConfigured) {
            return "turn-retry";
        }

        return "relay-fallback";
    }

    if (hasRelayCandidate) {
        return "relay-used";
    }

    if (retryCount >= 3) {
        return "user-notification";
    }

    return "ice-retry";
}

const IMPLEMENTATION_NOTES = [
    "小規模なネットワークでは、STUN だけで十分なことがある",
    "学校・社内回線では UDP や外部通信が制限されるので、P2P 接続が失敗しやすい",
    "TURN を使う前に、まずは接続失敗理由をユーザーに分かる形で確認する",
    "TURN が無い場合は、WebSocket relay などの中継サーバーへフォールバックする設計が必要",
    "接続が不安定な時は、ユーザーへ「ネットワーク環境を確認してください」と伝える"
];

if (typeof window !== "undefined") {
    window.NETWORK_STRATEGY = NETWORK_STRATEGY;
    window.FALLBACK_STRATEGY = FALLBACK_STRATEGY;
    window.evaluateConnectionFailureReason = evaluateConnectionFailureReason;
    window.getFallbackPlan = getFallbackPlan;
    window.IMPLEMENTATION_NOTES = IMPLEMENTATION_NOTES;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        NETWORK_STRATEGY,
        FALLBACK_STRATEGY,
        evaluateConnectionFailureReason,
        getFallbackPlan,
        IMPLEMENTATION_NOTES
    };
}