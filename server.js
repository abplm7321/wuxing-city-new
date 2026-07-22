const express = require('express');
const cors = require('cors');
const app = express();
const PORT = Number(process.env.PORT) || 3000;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

// ---------------------------------------------------------------------------
// 伺服器基本設定
// ---------------------------------------------------------------------------
// 允許跨網域請求，這樣你原本的 HTML 才能連到這個 Node.js 伺服器
app.use(cors());
// 讓 Express 可以讀取前端用 JSON 傳來的資料，例如 playerId、heroId、message。
app.use(express.json());
// 把這個資料夾當成靜態網站根目錄，瀏覽器才能讀 index.html、style.css、images。
app.use(express.static(__dirname));

// ---------------------------------------------------------------------------
// Google 登入設定與驗證
// ---------------------------------------------------------------------------
app.get('/api/auth/config', (req, res) => {
    res.json({ success: true, googleClientId: GOOGLE_CLIENT_ID });
});

app.post('/api/auth/google', async (req, res) => {
    const credential = req.body && req.body.credential;
    if (!GOOGLE_CLIENT_ID) {
        return res.status(500).json({ success: false, message: '尚未設定 GOOGLE_CLIENT_ID' });
    }
    if (!credential) {
        return res.status(400).json({ success: false, message: '缺少 Google 登入憑證' });
    }

    try {
        const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
        const profile = await response.json();
        if (!response.ok || profile.aud !== GOOGLE_CLIENT_ID || !profile.sub) {
            return res.status(401).json({ success: false, message: 'Google 登入驗證失敗' });
        }

        res.json({
            success: true,
            user: {
                id: profile.sub,
                name: profile.name || profile.email || '玩家',
                email: profile.email || '',
                picture: profile.picture || ''
            }
        });
    } catch (error) {
        res.status(502).json({ success: false, message: '無法連線至 Google 驗證服務' });
    }
});

// ---------------------------------------------------------------------------
// 英雄資料庫
// ---------------------------------------------------------------------------
const heroesDatabase = {
    "Cao-Cao": {
        name: "曹操",
        avatar: "images/heros/Cao-Cao.jpg",
        force: 0,
        culture: 0,
        passive: { name: "挟天子", desc: "每當任何玩家攻城成功時：<br>獲得+1文化" },
        passiveId: "caocao_passive",
        skills: [
            { name: "屯田令", cast: "1回施策", desc: "立刻獲得：<br>+1武力、+1文化<br>後續3次組字獲得的資源翻倍" },
        ]
    },
    "Guan-Yu": {
        name: "關羽",
        avatar: "images/heros/Guan-Yu.jpg",
        force: 0,
        culture: 0,
        passive: { name: "武聖", desc: "選擇一個「義行狀態」（持續到下次攻城前）：<br>忠·本回合你組字額外+1文化<br>義·本回合所有人武力+1 文化-2，自身武力+2 文化-1<br>斬·下一次攻城時攻擊消耗-1，但攻城後的積分減半" },
        passiveId: "yixing_choice",
        skills: [
            { name: "水淹七軍", cast: "1回施策（可2次）", desc: "每局兩次，攻城前使用<br>選擇一座城：進入士氣崩潰狀態（本回合）<br>1.所有人攻擊該城時武力消耗-1<br>2.該回合第一個攻此城成功者可選擇+1武力或文化" },
        ]
    },
    "Guo-Jia": {
        name: "郭嘉",
        avatar: "images/heros/Guo-Jia.jpg",
        force: 0,
        culture: 0,
        passive: { name: "先見紀錄", desc: "當任意玩家進行組字、攻城、使用錦囊時可以將此玩家的該行為加入「觀測列表」" },
        passiveId: "guojia_observe",
        skills: [
            { name: "截斷", cast: "1回施策", desc: "組字 ->只能獲得1點文化值<br>攻城 ->攻下後積分-1<br>錦囊 ->直接失效" }
        ]
    },
    "Han-Xin": {
        name: "韓信",
        avatar: "images/heros/Han-Xin.jpg",
        force: 0,
        culture: 0,
        passive: { name: "暗渡陳倉", desc: "每當組出一個字，不用立刻結算<br>改為放入「奇兵區」（上限3張）<br>在自己的回合時，可選擇奇兵區的字結算" },
        passiveId: "hanxin_ambush",
        skills: [
            { name: "十面埋伏", cast: "1回施策（可2次）", desc: "攻城前可以結算奇兵區中的字（使用時不會增加武力值與文化值）<br>每展示1張，獲得1次效果：<br>1.降低1點攻城消耗<br>2.攻城後該城防禦+1<br>3.攻城成功時最近那座城防禦-1" }
        ]
    },
    "Xiang-Yu": {
        name: "項羽",
        avatar: "images/heros/Xiang-Yu.jpg",
        force: 0,
        culture: 0,
        passive: { name: "霸王壓場", desc: "每回合每有一座城，武力+1" },
        passiveId: "xiangyu_force_per_city",
        skills: [
            { name: "破釜沈舟", cast: "整局一次", desc: "回合開始時決定是否進入「全押狀態」<br>整局只能發動一次<br>本回合攻城消耗固定為2<br>本回合不能使用錦囊<br>本回合無法獲得武力值與文化值" }
        ]
    },
    "Zhuge-Liang": {
        name: "諸葛",
        avatar: "images/heros/Zhuge-Liang.jpg",
        force: 0,
        culture: 0,
        passive: { name: "隆中對", desc: "遊戲開始時選擇一個方向：<br>軍略·每回合第一次組字後，額外抽1張部件牌<br>民生·每回合第一次合成，可選擇保留部首牌或部件牌<br>天機·每回合抽牌時，從2張部首與2張部件中各選1張" },
        passiveId: "zhuge_strategy",
        skills: [
            { name: "北伐", cast: "2回施策", desc: "每 2 回合可宣告一次本回合的五行運勢。<br>本回合每次成功組出該五行的字：<br>隨機翻出 1 張部首牌與 1 張部件牌，只能選 1 張加入手牌。" }
        ]
    }
};

// 取得單一英雄資訊：前端點英雄頭像、進入遊戲時會呼叫這支 API。
app.get('/api/hero/:id', (req, res) => {
    const heroId = req.params.id;
    const heroData = heroesDatabase[heroId];
    
    if (heroData) {
        res.json({ success: true, data: heroData });
    } else {
        res.status(404).json({ success: false, message: "找不到該英雄" });
    }
});

// ---------------------------------------------------------------------------
// 城池初始資料
// ---------------------------------------------------------------------------
// defense = 攻城需要的武力；points = 攻下後獲得的積分。
// player 只是顯示用文字；多人模式真正判斷歸屬會用 ownerPlayerNumber。
const initialCitiesDatabase = {
    "beiping": { 
        name: "北平", 
        defense: 5, 
        points: 2, 
        effect: "馬產地：攻打其他城池武力消耗減少1點", 
        effectId: "attackcost_minus",
        player: "無" 
    },
    "yecheng": { 
        name: "鄴城", 
        defense: 7, 
        points: 4, 
        effect: "銅雀台：每回合額外獲得1點文化", 
        effectId: "culture_per_round",
        player: "無" 
    },
    "xuzhou": { 
        name: "徐州", 
        defense: 6, 
        points: 3, 
        effect: "無", 
        player: "無" 
    },
    "luoyang": { 
        name: "洛陽", 
        defense: 8, 
        points: 5, 
        effect: "帝都：每回合額外獲得1點積分", 
        effectId: "score_per_round",
        player: "無" 
    },
    "hanzhong": { 
        name: "漢中", 
        defense: 6, 
        points: 3, 
        effect: "米倉：攻城後組字可獲得武力+1", 
        effectId: "force_plus",
        player: "無" 
    },
    "nanyang": { 
        name: "南陽", 
        defense: 5, 
        points: 2, 
        effect: "無", 
        player: "無" 
    },
    "xiangyang": { 
        name: "襄陽", 
        defense: 5, 
        points: 2, 
        effect: "無",
        player: "無" 
    },
    "jianye": { 
        name: "建業", 
        defense: 7, 
        points: 4, 
        effect: "水路要衝：每回合額外獲得1點武力",
        effectId: "force_per_round",
        player: "無" 
    },
    "jiangxia": { 
        name: "江夏", 
        defense: 5, 
        points: 2, 
        effect: "無", 
        player: "無" 
    },
    "chengdu": { 
        name: "成都", 
        defense: 7, 
        points: 4, 
        effect: "蜀道險阻：攻城成功後防禦+2", 
        effectId: "defense_plus",
        player: "無" 
    },
    "huiji": { 
        name: "會稽", 
        defense: 4, 
        points: 1, 
        effect: "無", 
        player: "無" 
    }
};

const cityEffects = {
    score_per_round({ owner, city }) {
        owner.score += 1;
        return `${owner.name} 因 ${city.name} 效果獲得 1 積分`;
    },
    culture_per_round({ owner, city }) {
        owner.culture = (owner.culture || 0) + 1;
        return `${owner.name} 因 ${city.name} 效果獲得 1 文化`;
    },
    force_per_round({ owner, city }) {
        owner.force = (owner.force || 0) + 1;
        return `${owner.name} 因 ${city.name} 效果獲得 1 武力`;
    }
};

const cityNeighborMap = {
    beiping: ['yecheng', 'xuzhou'],
    yecheng: ['beiping', 'luoyang', 'xuzhou'],
    xuzhou: ['beiping', 'yecheng', 'jianye', 'nanyang'],
    luoyang: ['yecheng', 'hanzhong', 'nanyang', 'xiangyang'],
    hanzhong: ['chengdu', 'luoyang', 'xiangyang'],
    nanyang: ['luoyang', 'xuzhou', 'xiangyang', 'jiangxia'],
    xiangyang: ['hanzhong', 'luoyang', 'nanyang', 'jiangxia', 'chengdu'],
    jianye: ['xuzhou', 'jiangxia', 'huiji'],
    jiangxia: ['nanyang', 'xiangyang', 'jianye', 'huiji'],
    chengdu: ['hanzhong', 'xiangyang'],
    huiji: ['jianye', 'jiangxia']
};

function reduceNearestCityDefense(room, cityId) {
    const nearestCityId = (cityNeighborMap[cityId] || []).find(id => {
        const city = room.cities[id];
        return city && (parseInt(city.defense, 10) || 0) > 1;
    });
    if (!nearestCityId) return null;
    const nearestCity = room.cities[nearestCityId];
    nearestCity.defense = Math.max(1, (parseInt(nearestCity.defense, 10) || 1) - 1);
    return nearestCity;
}

// 單機模式用的城池狀態。重置遊戲時會重新拷貝 initialCitiesDatabase。
let citiesDatabase = JSON.parse(JSON.stringify(initialCitiesDatabase));

// ---------------------------------------------------------------------------
// 多人房間狀態
// ---------------------------------------------------------------------------
// 使用 Map 用房號找到房間。資料存在記憶體中，所以伺服器重啟後房間會消失。
const rooms = new Map();
// 玩家多久沒有回報在線，才視為真正斷線。
// 關閉/刷新頁面會另外用 /leave 立即判定；這裡主要防網路中斷，所以不能太短。
const PLAYER_DISCONNECT_TIMEOUT_MS = 60000;

// 生成一串 5 碼房號，並避開容易混淆的 I / O / 1 / 0。
function createRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    do {
        // 隨機挑 5 個字元組成房號。
        code = Array.from({ length: 5 }, () => 
            chars[Math.floor(Math.random() * chars.length)]).join('');
    // 如果房號已經存在，就重新產生一次。
    } while (rooms.has(code));
    return code;
}

// 回傳給前端看的房間資料。
// 這裡會移除玩家 id 這類內部資料，只留下畫面需要顯示的資訊。
function publicRoom(room, viewerId) {
    return {
        code: room.code,
        players: room.players.map(({ name, heroId, heroName, passiveId, yixingStatus, yixingChoiceUsed, zhugeStrategy, zhugeFusionRoundUsed, zhugeBeifaRoundUsed, zhugeBeifaElement, caocaoTuntianRoundUsed, caocaoTuntianDoubleLeft, guanYuWaterFloodUsed, guojiaCutRoundUsed, hanxinAmbushSkillUsed, hanxinAmbushTactic, xiangyuAllInRound, xiangyuAllInChoiceRound, xiangyuAllInUsed, observationList, ambushCards, score, force, culture }) => ({ name, heroId, heroName, passiveId, yixingStatus, yixingChoiceUsed, zhugeStrategy, zhugeFusionRoundUsed, zhugeBeifaRoundUsed, zhugeBeifaElement, caocaoTuntianRoundUsed, caocaoTuntianDoubleLeft, guanYuWaterFloodUsed, guojiaCutRoundUsed, hanxinAmbushSkillUsed, hanxinAmbushTactic, xiangyuAllInRound, xiangyuAllInChoiceRound, xiangyuAllInUsed, observationList, ambushCards, score, force, culture })),
        cities: room.cities,
        // 遊戲紀錄最多回傳最近 100 筆，避免房間玩太久資料過大。
        logs: room.logs.slice(-100),
        round: room.round,
        // 目前行動者是第幾位玩家，前端用來排列回合頭像。
        currentPlayerNumber: Math.max(1, room.players.findIndex(player => player.id === room.currentPlayerId) + 1),
        currentPlayerName: room.players.find(player => player.id === room.currentPlayerId)?.name || room.players[0]?.name,
        // 對「正在看這份資料的人」來說，現在是不是自己的回合。
        yourTurn: room.players.length === 2 && room.currentPlayerId === viewerId,
        yourPlayerNumber: Math.max(1, room.players.findIndex(player => player.id === viewerId) + 1),
        gameOver: room.gameOver,
        winnerName: room.winnerName,
        winnerPlayerNumber: room.winnerPlayerNumber,
        isDraw: room.isDraw,
        version: room.version
    };
}

// 玩家中途離開時呼叫：如果房間已經有兩人，直接判定另一位玩家獲勝。
function finishRoomByLeave(room, leavingPlayer, reason = '離開遊戲') {
    if (!room || room.gameOver) return;
    const leavingIndex = room.players.findIndex(player => player.id === leavingPlayer.id);
    const winnerIndex = leavingIndex === 0 ? 1 : 0;
    const winner = room.players[winnerIndex];

    // 如果第二位玩家還沒加入，只記錄離開，不做正式勝負結算。
    if (!winner) {
        room.logs.push({ time: Date.now(), text: `${leavingPlayer.name} 離開了房間` });
        room.version += 1;
        rooms.delete(room.code);
        return;
    }

    room.gameOver = true;
    room.currentPlayerId = null;
    room.isDraw = false;
    room.winnerName = winner.name;
    room.winnerPlayerNumber = winnerIndex + 1;
    room.logs.push({ time: Date.now(), text: `${leavingPlayer.name} ${reason}，${winner.name} 獲得勝利` });
    room.version += 1;
}

// 每次玩家有任何同步/操作，就更新 lastSeen，代表這個玩家還在線。
function markPlayerSeen(player) {
    if (player) player.lastSeen = Date.now();
}

// 由仍在線的玩家輪詢房間時，檢查對手是否太久沒回報。
function settleIfOpponentDisconnected(room, viewerId) {
    if (!room || room.gameOver || room.players.length < 2) return;
    const now = Date.now();
    const disconnectedOpponent = room.players.find(player =>
        player.id !== viewerId &&
        player.lastSeen &&
        now - player.lastSeen > PLAYER_DISCONNECT_TIMEOUT_MS
    );
    if (disconnectedOpponent) {
        finishRoomByLeave(room, disconnectedOpponent, '連線中斷');
    }
}

// 建立房間：第一位玩家按「建立房間」時呼叫。
app.post('/api/rooms', (req, res) => {
    const code = createRoomCode();
    const playerId = `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const room = {
        code,
        // 每位玩家都會有自己的 playerId，後續攻城、結束回合都靠它驗證身份。
        players: [{ id: playerId, name: String(req.body.name || '玩家一').slice(0, 12), heroId: null, heroName: null, score: 0, force: 0, culture: 0, lastSeen: Date.now() }],
        // 每個房間都有自己的城池狀態，才不會不同房間互相影響。
        cities: JSON.parse(JSON.stringify(initialCitiesDatabase)),
        logs: [{ time: Date.now(), text: '房間已建立，等待第二位玩家加入' }],
        round: 1,
        currentPlayerId: playerId,
        gameOver: false,
        winnerName: null,
        winnerPlayerNumber: null,
        isDraw: false,
        version: 1
    };
    rooms.set(code, room);
    res.json({ success: true, playerId, playerNumber: 1, room: publicRoom(room, playerId) });
});

// 加入房間：第二位玩家輸入房號後呼叫。
app.post('/api/rooms/:code/join', (req, res) => {
    const room = rooms.get(req.params.code.toUpperCase());
    if (!room) return res.status(404).json({ success: false, message: '找不到房間' });
    if (room.players.length >= 2) return res.status(409).json({ success: false, message: '房間已滿' });
    const playerId = `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    room.players.push({ id: playerId, name: String(req.body.name || '玩家二').slice(0, 12), heroId: null, heroName: null, score: 0, force: 0, culture: 0, lastSeen: Date.now() });
    room.logs.push({ time: Date.now(), text: `${room.players[1].name} 加入了房間` });
    room.version += 1;
    res.json({ success: true, playerId, playerNumber: 2, room: publicRoom(room, playerId) });
});

// 同步房間：前端每秒輪詢一次，拿最新回合、城池、紀錄、分數。
app.get('/api/rooms/:code', (req, res) => {
    const room = rooms.get(req.params.code.toUpperCase());
    if (!room) return res.status(404).json({ success: false, message: '房間不存在或伺服器已重啟' });
    const viewer = room.players.find(player => player.id === req.query.playerId);
    if (!viewer) {
        return res.status(403).json({ success: false, message: '玩家憑證無效' });
    }
    markPlayerSeen(viewer);
    settleIfOpponentDisconnected(room, viewer.id);
    res.json({ success: true, room: publicRoom(room, req.query.playerId) });
});

// 心跳：頁面仍開著時定期呼叫，只更新在線時間，不回傳完整房間資料。
app.post('/api/rooms/:code/ping', (req, res) => {
    const room = rooms.get(req.params.code.toUpperCase());
    const player = room && room.players.find(item => item.id === req.body.playerId);
    if (!room || !player) return res.status(400).json({ success: false, message: '房間或玩家資料錯誤' });
    markPlayerSeen(player);
    settleIfOpponentDisconnected(room, player.id);
    res.json({ success: true, room: publicRoom(room, player.id) });
});

// 選擇英雄：玩家點選英雄後，同步給同房間的另一位玩家。
app.post('/api/rooms/:code/hero', (req, res) => {
    const room = rooms.get(req.params.code.toUpperCase());
    const player = room && room.players.find(item => item.id === req.body.playerId);
    const hero = heroesDatabase[req.body.heroId];
    if (!room || !player || !hero) return res.status(400).json({ success: false, message: '無法選擇英雄' });
    markPlayerSeen(player);
    player.heroId = req.body.heroId;
    player.heroName = hero.name;
    player.passiveId = hero.passiveId || null;
    player.yixingStatus = null;
    player.yixingChoiceUsed = false;
    player.zhugeStrategy = null;
    player.zhugeFusionRoundUsed = null;
    player.zhugeBeifaRoundUsed = null;
    player.zhugeBeifaElement = null;
    player.caocaoTuntianRoundUsed = null;
    player.caocaoTuntianDoubleLeft = 0;
    player.guanYuWaterFloodUsed = 0;
    player.guojiaCutRoundUsed = null;
    player.guojiaCutTarget = null;
    player.hanxinAmbushSkillUsed = 0;
    player.hanxinAmbushTactic = [];
    player.xiangyuAllInRound = null;
    player.xiangyuAllInChoiceRound = null;
    player.xiangyuAllInUsed = false;
    player.observationList = hero.passiveId === 'guojia_observe' ? [] : [];
    player.ambushCards = hero.passiveId === 'hanxin_ambush' ? [] : [];
    player.force = hero.force || 0;
    player.culture = hero.culture || 0;
    room.logs.push({ time: Date.now(), text: `${player.name} 選擇了 ${hero.name}` });
    room.version += 1;
    res.json({ success: true, room: publicRoom(room, player.id) });
});

const yixingStatusNames = {
    zhong: '忠',
    yi: '義',
    zhan: '斬'
};

const zhugeStrategyNames = {
    junlue: '軍略',
    minsheng: '民生',
    tianji: '天機'
};

const wuxingElementNames = {
    wood: '木',
    water: '水',
    fire: '火',
    gold: '金',
    earth: '土'
};

function recordGuojiaObservation(room, actor, actionType, detail) {
    if (!room || !actor) return;
    const actorPlayerNumber = room.players.findIndex(player => player.id === actor.id) + 1;
    const guojiaPlayers = room.players.filter(player => player.passiveId === 'guojia_observe');
    guojiaPlayers.forEach(guojia => {
        if (guojia.id === actor.id) return;
        if (!Array.isArray(guojia.observationList)) guojia.observationList = [];
        guojia.observationList.unshift({
            time: Date.now(),
            actorName: actor.name,
            actorPlayerNumber,
            actionType,
            detail
        });
        guojia.observationList = guojia.observationList.slice(0, 8);
    });
}

// 關羽被動：開局選擇一個義行狀態。
app.post('/api/rooms/:code/passive-choice', (req, res) => {
    const room = rooms.get(req.params.code.toUpperCase());
    const player = room && room.players.find(item => item.id === req.body.playerId);
    const choice = req.body.choice;
    if (!room || !player) return res.status(400).json({ success: false, message: '房間或玩家資料錯誤' });
    markPlayerSeen(player);
    if (room.gameOver) return res.status(409).json({ success: false, message: '遊戲已結束' });
    if (player.passiveId !== 'yixing_choice') return res.status(403).json({ success: false, message: '這個角色不能選擇義行狀態' });
    if (player.yixingStatus) return res.status(409).json({ success: false, message: '目前已經有義行狀態' });
    if (!yixingStatusNames[choice]) return res.status(400).json({ success: false, message: '義行狀態錯誤' });

    player.yixingStatus = choice;
    player.yixingChoiceUsed = true;

    if (choice === 'yi') {
        room.players.forEach(item => {
            if (item.id === player.id) {
                item.force = (item.force || 0) + 2;
                item.culture = Math.max(0, (item.culture || 0) - 1);
            } else {
                item.force = (item.force || 0) + 1;
                item.culture = Math.max(0, (item.culture || 0) - 2);
            }
        });
    }

    const effectText = choice === 'zhong'
        ? '組字時額外獲得 1 文化'
        : choice === 'yi'
            ? '所有人武力與文化重新調整'
            : '下一次攻城消耗 -1，但攻城得分減半';
    room.logs.push({ time: Date.now(), text: `${player.name} 選擇義行・${yixingStatusNames[choice]}，${effectText}` });
    room.version += 1;
    res.json({ success: true, room: publicRoom(room, player.id) });
});

// 諸葛被動：開局選擇隆中對方向。
app.post('/api/rooms/:code/zhuge-strategy', (req, res) => {
    const room = rooms.get(req.params.code.toUpperCase());
    const player = room && room.players.find(item => item.id === req.body.playerId);
    const strategy = req.body.strategy;
    if (!room || !player) return res.status(400).json({ success: false, message: '房間或玩家資料錯誤' });
    markPlayerSeen(player);
    if (room.gameOver) return res.status(409).json({ success: false, message: '遊戲已結束' });
    if (player.passiveId !== 'zhuge_strategy') return res.status(403).json({ success: false, message: '這個角色不能選擇隆中方向' });
    if (player.zhugeStrategy) return res.status(409).json({ success: false, message: '隆中方向已經選過了' });
    if (!zhugeStrategyNames[strategy]) return res.status(400).json({ success: false, message: '隆中方向錯誤' });

    player.zhugeStrategy = strategy;
    room.logs.push({ time: Date.now(), text: `${player.name} 選擇隆中對・${zhugeStrategyNames[strategy]}` });
    room.version += 1;
    res.json({ success: true, room: publicRoom(room, player.id) });
});

// 諸葛技能：北伐。每 2 回合一次，先宣告五行；本回合每次組出對應五行時都觸發抽牌二選一。
app.post('/api/rooms/:code/zhuge-beifa', (req, res) => {
    const room = rooms.get(req.params.code.toUpperCase());
    const player = room && room.players.find(item => item.id === req.body.playerId);
    const element = req.body.element;
    if (!room || !player) return res.status(400).json({ success: false, message: '房間或玩家資料錯誤' });
    markPlayerSeen(player);
    if (room.gameOver) return res.status(409).json({ success: false, message: '遊戲已結束' });
    if (room.currentPlayerId !== player.id) return res.status(403).json({ success: false, message: '現在不是你的回合' });
    if (player.heroId !== 'Zhuge-Liang') return res.status(403).json({ success: false, message: '只有諸葛可以使用北伐' });
    if (player.zhugeBeifaRoundUsed === room.round) return res.status(409).json({ success: false, message: '本回合已經宣告過北伐' });
    if (player.zhugeBeifaRoundUsed && room.round - player.zhugeBeifaRoundUsed < 2) {
        return res.status(409).json({ success: false, message: `北伐尚在冷卻，第 ${player.zhugeBeifaRoundUsed + 2} 回合才能再次宣告` });
    }
    if (!wuxingElementNames[element]) return res.status(400).json({ success: false, message: '請選擇要宣告的五行' });

    player.zhugeBeifaRoundUsed = room.round;
    player.zhugeBeifaElement = element;
    room.logs.push({ time: Date.now(), text: `${player.name} 使用諸葛技能・北伐，宣告五行【${wuxingElementNames[element]}】` });
    room.version += 1;
    res.json({ success: true, room: publicRoom(room, player.id) });
});

// 曹操技能：屯田令。每回合一次，立刻 +1 武力/+1 文化，並讓後續 3 次組字資源翻倍。
app.post('/api/rooms/:code/caocao-tuntian', (req, res) => {
    const room = rooms.get(req.params.code.toUpperCase());
    const player = room && room.players.find(item => item.id === req.body.playerId);
    if (!room || !player) return res.status(400).json({ success: false, message: '房間或玩家資料錯誤' });
    markPlayerSeen(player);
    if (room.gameOver) return res.status(409).json({ success: false, message: '遊戲已結束' });
    if (room.currentPlayerId !== player.id) return res.status(403).json({ success: false, message: '現在不是你的回合' });
    if (player.heroId !== 'Cao-Cao') return res.status(403).json({ success: false, message: '只有曹操可以使用屯田令' });
    if (player.caocaoTuntianRoundUsed === room.round) return res.status(409).json({ success: false, message: '本回合已經使用過屯田令' });

    player.caocaoTuntianRoundUsed = room.round;
    player.caocaoTuntianDoubleLeft = 3;
    player.force = (player.force || 0) + 1;
    player.culture = (player.culture || 0) + 1;
    room.logs.push({ time: Date.now(), text: `${player.name} 使用曹操技能・屯田令` });
    room.version += 1;
    res.json({ success: true, room: publicRoom(room, player.id) });
});

// 關羽技能：水淹七軍。每局最多 2 次，選一座城使其本回合攻城消耗 -1。
app.post('/api/rooms/:code/guanyu-water-flood', (req, res) => {
    const room = rooms.get(req.params.code.toUpperCase());
    const player = room && room.players.find(item => item.id === req.body.playerId);
    const cityId = req.body.cityId;
    const city = room && room.cities[cityId];
    if (!room || !player || !city) return res.status(400).json({ success: false, message: '請先選擇要水淹的城池' });
    markPlayerSeen(player);
    if (room.gameOver) return res.status(409).json({ success: false, message: '遊戲已結束' });
    if (room.currentPlayerId !== player.id) return res.status(403).json({ success: false, message: '現在不是你的回合' });
    if (player.heroId !== 'Guan-Yu') return res.status(403).json({ success: false, message: '只有關羽可以使用水淹七軍' });
    if ((player.guanYuWaterFloodUsed || 0) >= 2) return res.status(409).json({ success: false, message: '水淹七軍本局已用完' });
    if (city.guanYuWaterFloodRound === room.round) return res.status(409).json({ success: false, message: `${city.name} 本回合已經進入士氣崩潰` });

    player.guanYuWaterFloodUsed = (player.guanYuWaterFloodUsed || 0) + 1;
    city.guanYuWaterFloodRound = room.round;
    city.guanYuWaterFloodClaimed = false;
    city.guanYuWaterFloodCasterName = player.name;
    room.logs.push({ time: Date.now(), text: `${player.name} 使用關羽技能，${city.name}本回合士氣崩潰` });
    room.version += 1;
    res.json({ success: true, room: publicRoom(room, player.id) });
});

// 郭嘉技能：截斷。選一筆先見紀錄，讓該玩家下一次同類型行動被削弱。
app.post('/api/rooms/:code/guojia-cut', (req, res) => {
    const room = rooms.get(req.params.code.toUpperCase());
    const player = room && room.players.find(item => item.id === req.body.playerId);
    const observationIndex = parseInt(req.body.observationIndex, 10);
    if (!room || !player) return res.status(400).json({ success: false, message: '房間或玩家資料錯誤' });
    markPlayerSeen(player);
    if (room.gameOver) return res.status(409).json({ success: false, message: '遊戲已結束' });
    if (room.currentPlayerId !== player.id) return res.status(403).json({ success: false, message: '現在不是你的回合' });
    if (player.heroId !== 'Guo-Jia') return res.status(403).json({ success: false, message: '只有郭嘉可以使用截斷' });
    if (player.guojiaCutRoundUsed === room.round) return res.status(409).json({ success: false, message: '本回合已經使用過截斷' });
    if (!Array.isArray(player.observationList) || Number.isNaN(observationIndex) || observationIndex < 0 || observationIndex >= player.observationList.length) {
        return res.status(400).json({ success: false, message: '請先選擇一筆先見紀錄' });
    }

    const observation = player.observationList[observationIndex];
    const actionType = observation.actionType;
    if (actionType !== '組字' && actionType !== '攻城') {
        return res.status(400).json({ success: false, message: '目前只能截斷組字或攻城紀錄' });
    }

    const targetPlayerNumber = observation.actorPlayerNumber ||
        room.players.findIndex(item => item.name === observation.actorName) + 1;
    const target = room.players[targetPlayerNumber - 1];
    if (!target || target.id === player.id) return res.status(400).json({ success: false, message: '找不到要截斷的玩家' });

    player.guojiaCutRoundUsed = room.round;
    target.guojiaCutTarget = {
        actionType,
        sourceName: player.name,
        round: room.round
    };
    player.observationList.splice(observationIndex, 1);
    room.logs.push({ time: Date.now(), text: `${player.name} 使用郭嘉技能・截斷，鎖定 ${target.name} 的下一次${actionType}` });
    room.version += 1;
    res.json({ success: true, room: publicRoom(room, player.id) });
});

// 韓信被動：組出的字先放進奇兵區，不立刻結算資源。
app.post('/api/rooms/:code/ambush', (req, res) => {
    const room = rooms.get(req.params.code.toUpperCase());
    const player = room && room.players.find(item => item.id === req.body.playerId);
    if (!room || !player) return res.status(400).json({ success: false, message: '房間或玩家資料錯誤' });
    markPlayerSeen(player);
    if (room.gameOver) return res.status(409).json({ success: false, message: '遊戲已結束' });
    if (room.currentPlayerId !== player.id) return res.status(403).json({ success: false, message: '現在不是你的回合' });
    if (player.passiveId !== 'hanxin_ambush') return res.status(403).json({ success: false, message: '這個角色不能使用奇兵區' });

    if (!Array.isArray(player.ambushCards)) player.ambushCards = [];
    if (player.ambushCards.length >= 3) return res.status(409).json({ success: false, message: '奇兵區已滿，請先結算一張' });

    const word = String(req.body.word || '新字').slice(0, 2);
    player.ambushCards.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        word,
        force: 0,
        culture: 0
    });
    room.version += 1;
    res.json({ success: true, room: publicRoom(room, player.id) });
});

// 舊版接口保留相容：奇兵牌不再因點擊直接消耗，只會在十面埋伏中消耗。
app.post('/api/rooms/:code/ambush-settle', (req, res) => {
    const room = rooms.get(req.params.code.toUpperCase());
    const player = room && room.players.find(item => item.id === req.body.playerId);
    if (!room || !player) return res.status(400).json({ success: false, message: '房間或玩家資料錯誤' });
    markPlayerSeen(player);
    if (room.gameOver) return res.status(409).json({ success: false, message: '遊戲已結束' });
    if (room.currentPlayerId !== player.id) return res.status(403).json({ success: false, message: '現在不是你的回合' });
    if (player.passiveId !== 'hanxin_ambush') return res.status(403).json({ success: false, message: '這個角色不能使用奇兵區' });

    const index = parseInt(req.body.index, 10);
    if (!Array.isArray(player.ambushCards) || Number.isNaN(index) || index < 0 || index >= player.ambushCards.length) {
        return res.status(400).json({ success: false, message: '找不到這張奇兵牌' });
    }

    const card = player.ambushCards[index];
    room.logs.push({ time: Date.now(), text: `${player.name} 查看奇兵 ${card.word}，未消耗奇兵牌` });
    room.version += 1;
    res.json({ success: true, card, room: publicRoom(room, player.id) });
});

// 韓信技能：十面埋伏。每局最多 2 次，展示 1 張奇兵牌並選擇下一次攻城效果。
app.post('/api/rooms/:code/hanxin-ambush-skill', (req, res) => {
    const room = rooms.get(req.params.code.toUpperCase());
    const player = room && room.players.find(item => item.id === req.body.playerId);
    const index = parseInt(req.body.index, 10);
    const effect = req.body.effect;
    const effectNames = {
        cost_minus: '下一次攻城消耗 -1',
        defense_after: '下一次攻城成功後，該城防禦 +1',
        nearby_minus: '下一次攻城成功後，最近城池防禦 -1'
    };
    if (!room || !player) return res.status(400).json({ success: false, message: '房間或玩家資料錯誤' });
    markPlayerSeen(player);
    if (room.gameOver) return res.status(409).json({ success: false, message: '遊戲已結束' });
    if (room.currentPlayerId !== player.id) return res.status(403).json({ success: false, message: '現在不是你的回合' });
    if (player.heroId !== 'Han-Xin') return res.status(403).json({ success: false, message: '只有韓信可以使用十面埋伏' });
    if ((player.hanxinAmbushSkillUsed || 0) >= 2) return res.status(409).json({ success: false, message: '十面埋伏本局已用完' });
    if (!effectNames[effect]) return res.status(400).json({ success: false, message: '請選擇正確的埋伏效果' });
    if (!Array.isArray(player.ambushCards) || Number.isNaN(index) || index < 0 || index >= player.ambushCards.length) {
        return res.status(400).json({ success: false, message: '請選擇一張奇兵牌' });
    }

    const [card] = player.ambushCards.splice(index, 1);
    player.hanxinAmbushSkillUsed = (player.hanxinAmbushSkillUsed || 0) + 1;
    if (!Array.isArray(player.hanxinAmbushTactic)) player.hanxinAmbushTactic = [];
    player.hanxinAmbushTactic.push({
        effect,
        cardWord: card.word,
        round: room.round
    });
    room.logs.push({ time: Date.now(), text: `${player.name} 使用韓信技能・十面埋伏，${effectNames[effect]}` });
    room.version += 1;
    res.json({ success: true, room: publicRoom(room, player.id) });
});

// 項羽技能：破釜沈舟。整局只能發動一次；發動當回合攻城消耗固定為 2，且無法獲得武力與文化。
app.post('/api/rooms/:code/xiangyu-all-in', (req, res) => {
    const room = rooms.get(req.params.code.toUpperCase());
    const player = room && room.players.find(item => item.id === req.body.playerId);
    if (!room || !player) return res.status(400).json({ success: false, message: '房間或玩家資料錯誤' });
    markPlayerSeen(player);
    if (room.gameOver) return res.status(409).json({ success: false, message: '遊戲已結束' });
    if (room.currentPlayerId !== player.id) return res.status(403).json({ success: false, message: '現在不是你的回合' });
    if (player.heroId !== 'Xiang-Yu') return res.status(403).json({ success: false, message: '只有項羽可以使用破釜沈舟' });
    if (player.xiangyuAllInUsed) return res.status(409).json({ success: false, message: '破釜沈舟整局只能發動一次' });
    if (player.xiangyuAllInChoiceRound === room.round) return res.status(409).json({ success: false, message: '本回合已經選擇過破釜沈舟' });

    player.xiangyuAllInChoiceRound = room.round;
    player.xiangyuAllInRound = room.round;
    player.xiangyuAllInUsed = true;
    room.logs.push({ time: Date.now(), text: `${player.name} 使用項羽技能・破釜沈舟，本回合攻城消耗固定為 2，無法獲得武力與文化` });
    room.version += 1;
    res.json({ success: true, room: publicRoom(room, player.id) });
});

// 項羽技能：本回合選擇不發動破釜沈舟。這不會消耗整局一次的發動機會，只避免本回合提示重複跳出。
app.post('/api/rooms/:code/xiangyu-all-in-skip', (req, res) => {
    const room = rooms.get(req.params.code.toUpperCase());
    const player = room && room.players.find(item => item.id === req.body.playerId);
    if (!room || !player) return res.status(400).json({ success: false, message: '房間或玩家資料錯誤' });
    markPlayerSeen(player);
    if (room.gameOver) return res.status(409).json({ success: false, message: '遊戲已結束' });
    if (room.currentPlayerId !== player.id) return res.status(403).json({ success: false, message: '現在不是你的回合' });
    if (player.heroId !== 'Xiang-Yu') return res.status(403).json({ success: false, message: '只有項羽可以選擇破釜沈舟' });
    if (player.xiangyuAllInUsed) return res.status(409).json({ success: false, message: '破釜沈舟整局已發動過' });
    if (player.xiangyuAllInChoiceRound === room.round) return res.status(409).json({ success: false, message: '本回合已經選擇過破釜沈舟' });

    player.xiangyuAllInChoiceRound = room.round;
    room.logs.push({ time: Date.now(), text: `${player.name} 本回合選擇不發動破釜沈舟` });
    room.version += 1;
    res.json({ success: true, room: publicRoom(room, player.id) });
});

// 攻城 / 升級城防：所有會改變城池狀態的動作都走這裡。
// 這裡也會檢查是不是自己的回合，避免對手回合偷操作。
app.post('/api/rooms/:code/city/:id', (req, res) => {
    const room = rooms.get(req.params.code.toUpperCase());
    const player = room && room.players.find(item => item.id === req.body.playerId);
    const playerNumber = room ? room.players.findIndex(item => item.id === req.body.playerId) + 1 : 0;
    const city = room && room.cities[req.params.id];
    if (!room || !player || !city) return res.status(400).json({ success: false, message: '房間或城池資料錯誤' });
    markPlayerSeen(player);
    if (room.gameOver) return res.status(409).json({ success: false, message: '遊戲已結束' });
    if (room.currentPlayerId !== player.id) return res.status(403).json({ success: false, message: '現在不是你的回合' });
    // 用 ownerPlayerNumber 記錄真正城池歸屬，避免同英雄名造成誤判。
    const previousOwnerPlayerNumber = city.ownerPlayerNumber || null;
    const attackYixingStatus = req.body.action === 'attack' ? player.yixingStatus : null;
    let actualAttackForceCost = Math.max(0, parseInt(req.body.forceCost || city.defense || 0, 10) || 0);
    const isXiangyuAllIn = req.body.action === 'attack' && player.xiangyuAllInRound === room.round;
    const isGuanYuFloodActive = req.body.action === 'attack' && city.guanYuWaterFloodRound === room.round;
    const activeGuojiaCut = req.body.action === 'attack' && player.guojiaCutTarget?.actionType === '攻城'
        ? player.guojiaCutTarget
        : null;
    const activeHanxinTactics = req.body.action === 'attack'
        ? (Array.isArray(player.hanxinAmbushTactic)
            ? player.hanxinAmbushTactic
            : player.hanxinAmbushTactic
                ? [player.hanxinAmbushTactic]
                : [])
        : [];
    const afterAttackLogs = [];
    if (req.body.action === 'attack') {
        const hasBeiping = Object.values(room.cities).some(item =>
            item.effectId === "attackcost_minus" &&
            item.ownerPlayerNumber === playerNumber
        );
        if (isXiangyuAllIn) {
            actualAttackForceCost = 2;
        } else {
            actualAttackForceCost = parseInt(city.defense || 0, 10) || 0;
            if (hasBeiping) actualAttackForceCost -= 1;
            if (attackYixingStatus === 'zhan') actualAttackForceCost -= 1;
            if (isGuanYuFloodActive) actualAttackForceCost -= 1;
            const hanxinCostMinusCount = activeHanxinTactics.filter(tactic => tactic.effect === 'cost_minus').length;
            actualAttackForceCost -= hanxinCostMinusCount;
        }
        actualAttackForceCost = Math.max(1, actualAttackForceCost);
        if ((player.force || 0) < actualAttackForceCost) {
            return res.status(409).json({ success: false, message: `武力不足，需要 ${actualAttackForceCost} 武力` });
        }
    }
    if (req.body.action === 'attack') {
        // 攻城成功時，把城池歸屬改成目前行動玩家。
        city.player = player.heroName || req.body.player || player.name;
        city.ownerPlayerId = player.id;
        city.ownerPlayerNumber = playerNumber;
        city.ownerName = player.name;
        player.force = Math.max(0, (player.force || 0) - actualAttackForceCost);
        // 城池效果：攻下帶有 defense_plus 效果的城池後，該城自己的防禦 +2。
        if (city.effectId === 'defense_plus' && previousOwnerPlayerNumber !== playerNumber) {
            city.defense = (parseInt(city.defense, 10) || 0) + 2;
        }
        const hanxinDefenseAfterCount = activeHanxinTactics.filter(tactic => tactic.effect === 'defense_after').length;
        if (hanxinDefenseAfterCount > 0 && previousOwnerPlayerNumber !== playerNumber) {
            city.defense = (parseInt(city.defense, 10) || 0) + hanxinDefenseAfterCount;
            afterAttackLogs.push({
                time: Date.now(),
                text: `${player.name} 的十面埋伏生效，${city.name} 防禦 +${hanxinDefenseAfterCount}`
            });
        }
        const hanxinNearbyMinusCount = activeHanxinTactics.filter(tactic => tactic.effect === 'nearby_minus').length;
        if (hanxinNearbyMinusCount > 0 && previousOwnerPlayerNumber !== playerNumber) {
            for (let i = 0; i < hanxinNearbyMinusCount; i += 1) {
                const nearestCity = reduceNearestCityDefense(room, req.params.id);
                if (nearestCity) {
                    afterAttackLogs.push({
                        time: Date.now(),
                        text: `${player.name} 的十面埋伏生效，最近城池 ${nearestCity.name} 防禦 -1`
                    });
                }
            }
        }
        // 曹操被動：場上任意玩家真正攻下城池時，曹操玩家獲得 1 文化。
        const caocaoPlayer = room.players.find(item => item.passiveId === "caocao_passive");

        if (caocaoPlayer && previousOwnerPlayerNumber !== playerNumber) {
            caocaoPlayer.culture = (caocaoPlayer.culture || 0) + 1;

            afterAttackLogs.push({
                time: Date.now(),
                text: `${caocaoPlayer.name} 發動曹操被動，因 ${player.name} 攻城成功獲得 1 文化`
            });
        }
    } else if (req.body.player !== undefined) {
        city.player = req.body.player;
    }
    // 升級防禦時，前端會傳新的 defense 值進來。
    if (req.body.defense !== undefined) city.defense = parseInt(req.body.defense) || city.defense;
    // 多人模式的文化值也存在後端；升級防禦成功時同步扣 2 文化。
    if (req.body.action === 'upgrade') {
        player.culture = Math.max(0, (player.culture || 0) - 2);
    }
    // 只有攻下「不是自己原本擁有」的城才加積分。
    let gainedPoints = city.points;
    if (req.body.action === 'attack' && previousOwnerPlayerNumber !== playerNumber) {
        if (attackYixingStatus === 'zhan') {
            gainedPoints = Math.ceil(city.points / 2);
        }
        if (activeGuojiaCut) {
            gainedPoints = Math.max(0, gainedPoints - 1);
        }
        player.score += gainedPoints;
        recordGuojiaObservation(room, player, '攻城', `攻下 ${city.name}，獲得 ${gainedPoints} 積分`);
        if (activeGuojiaCut) {
            afterAttackLogs.push({
                time: Date.now(),
                text: `${activeGuojiaCut.sourceName} 的截斷生效，${player.name} 本次攻城積分 -1`
            });
            player.guojiaCutTarget = null;
        }
        if (attackYixingStatus) {
            player.yixingStatus = null;
            player.yixingChoiceUsed = false;
        }
        if (isGuanYuFloodActive && !city.guanYuWaterFloodClaimed) {
            const reward = req.body.guanYuFloodReward === 'culture' ? 'culture' : 'force';
            if (reward === 'culture') {
                player.culture = (player.culture || 0) + 1;
            } else {
                player.force = (player.force || 0) + 1;
            }
            city.guanYuWaterFloodClaimed = true;
            afterAttackLogs.push({
                time: Date.now(),
                text: `${player.name} 率先攻下士氣崩潰的 ${city.name}，水淹七軍獎勵獲得 1 ${reward === 'culture' ? '文化' : '武力'}`
            });
        }
        if (activeHanxinTactics.length > 0) {
            player.hanxinAmbushTactic = [];
        }
    }
    // 把攻城或升級結果寫進遊戲紀錄，前端紀錄區會顯示。
    const attackForceCost = actualAttackForceCost;
    const defensePlusText = req.body.action === 'attack' && city.effectId === 'defense_plus' && previousOwnerPlayerNumber !== playerNumber
        ? `，${city.name} 效果使城防提升到 ${city.defense}`
        : '';
    const yixingZhanText = req.body.action === 'attack' && gainedPoints !== city.points
        ? '，義行・斬使攻城積分減半'
        : '';
    const guanYuFloodText = req.body.action === 'attack' && isGuanYuFloodActive
        ? '，水淹七軍使攻城消耗 -1'
        : '';
    const guojiaCutText = req.body.action === 'attack' && activeGuojiaCut
        ? '，郭嘉截斷使攻城積分 -1'
        : '';
    const hanxinTacticText = req.body.action === 'attack' && activeHanxinTactics.length > 0
        ? `，十面埋伏發動${activeHanxinTactics.length}層`
        : '';
    const xiangyuAllInText = req.body.action === 'attack' && isXiangyuAllIn
        ? '，破釜沈舟使攻城消耗固定為 2'
        : '';
    const logText = req.body.action === 'upgrade'
        ? `${player.name} 升級了 ${city.name} 的防禦`
        : `${player.name} 攻下了 ${city.name}${guojiaCutText}${hanxinTacticText}${xiangyuAllInText}`;
    room.logs.push({ time: Date.now(), text: logText });
    room.logs.push(...afterAttackLogs);
    room.version += 1;
    res.json({ success: true, data: city, room: publicRoom(room, player.id) });
});

// 合成卡牌等資源變動：同步玩家武力與文化，避免前端加完後又被後端舊資料蓋回去。
app.post('/api/rooms/:code/resource', (req, res) => {
    const room = rooms.get(req.params.code.toUpperCase());
    const player = room && room.players.find(item => item.id === req.body.playerId);
    if (!room || !player) return res.status(400).json({ success: false, message: '房間或玩家資料錯誤' });
    markPlayerSeen(player);
    if (room.gameOver) return res.status(409).json({ success: false, message: '遊戲已結束' });
    if (room.currentPlayerId !== player.id) return res.status(403).json({ success: false, message: '現在不是你的回合' });
    let forceGain = Math.max(0, parseInt(req.body.force || 0, 10) || 0);
    let cultureGain = Math.max(0, parseInt(req.body.culture || 0, 10) || 0);
    let zhugeBeifaTriggered = false;
    const fusionElement = String(req.body.element || '');
    const activeGuojiaCut = req.body.reason === 'fusion' && player.guojiaCutTarget?.actionType === '組字'
        ? player.guojiaCutTarget
        : null;
    if (req.body.reason === 'fusion' && player.yixingStatus === 'zhong') {
        cultureGain += 1;
    }
    if (req.body.reason === 'fusion' && (player.caocaoTuntianDoubleLeft || 0) > 0) {
        forceGain *= 2;
        cultureGain *= 2;
        player.caocaoTuntianDoubleLeft = Math.max(0, (player.caocaoTuntianDoubleLeft || 0) - 1);
        room.logs.push({ time: Date.now(), text: `${player.name} 觸發屯田令，本次組字資源翻倍（剩餘 ${player.caocaoTuntianDoubleLeft} 次）` });
    }
    if (activeGuojiaCut) {
        forceGain = 0;
        cultureGain = 1;
        player.guojiaCutTarget = null;
        room.logs.push({ time: Date.now(), text: `${activeGuojiaCut.sourceName} 的截斷生效，${player.name} 下次組字只能獲得 1 文化` });
    }
    if (player.xiangyuAllInRound === room.round) {
        forceGain = 0;
        cultureGain = 0;
        room.logs.push({ time: Date.now(), text: `${player.name} 破釜沈舟中，本次無法獲得武力與文化` });
    }
    if (req.body.reason === 'fusion' &&
        player.heroId === 'Zhuge-Liang' &&
        player.zhugeBeifaRoundUsed === room.round &&
        player.zhugeBeifaElement &&
        player.zhugeBeifaElement === fusionElement) {
        zhugeBeifaTriggered = true;
    }
    player.force = (player.force || 0) + forceGain;
    player.culture = (player.culture || 0) + cultureGain;
    if (req.body.reason === 'fusion') {
        recordGuojiaObservation(room, player, '組字', `組出 ${req.body.word || '新字'}，獲得 ${forceGain} 武力、${cultureGain} 文化`);
    }
    
    room.version += 1;
    res.json({ success: true, room: publicRoom(room, player.id), zhugeBeifaTriggered });
});

// 玩家自訂訊息：右側「遊戲紀錄」輸入框送出的文字會走這支 API。
app.post('/api/rooms/:code/message', (req, res) => {
    const room = rooms.get(req.params.code.toUpperCase());
    const player = room && room.players.find(item => item.id === req.body.playerId);
    const message = String(req.body.message || '').trim().slice(0, 80);
    if (!room || !player) return res.status(400).json({ success: false, message: '房間或玩家資料錯誤' });
    markPlayerSeen(player);
    if (!message) return res.status(400).json({ success: false, message: '請輸入要傳送的文字' });
    room.logs.push({ time: Date.now(), text: `${player.name}：${message}` });
    room.version += 1;
    res.json({ success: true, room: publicRoom(room, player.id) });
});

// 玩家離開遊戲：關閉分頁、離開頁面時由前端通知，另一位玩家立刻勝利。
app.post('/api/rooms/:code/leave', (req, res) => {
    const room = rooms.get(req.params.code.toUpperCase());
    const player = room && room.players.find(item => item.id === req.body.playerId);
    if (!room || !player) return res.status(400).json({ success: false, message: '房間或玩家資料錯誤' });
    markPlayerSeen(player);
    finishRoomByLeave(room, player);
    res.json({ success: true, room: publicRoom(room, player.id) });
});

// 結束回合：目前行動玩家按下「結束回合」時呼叫。
app.post('/api/rooms/:code/end-turn', (req, res) => {
    const room = rooms.get(req.params.code.toUpperCase());
    const playerIndex = room && room.players.findIndex(player => player.id === req.body.playerId);
    if (!room || playerIndex < 0) return res.status(400).json({ success: false, message: '房間或玩家資料錯誤' });
    markPlayerSeen(room.players[playerIndex]);
    if (room.gameOver) return res.status(409).json({ success: false, message: '遊戲已結束' });
    if (room.players.length < 2) return res.status(409).json({ success: false, message: '尚未完成配對' });
    if (room.currentPlayerId !== req.body.playerId) return res.status(403).json({ success: false, message: '現在不是你的回合' });

    // 諸葛北伐只維持「自己的當回合」。
    // 因此只要這位玩家結束行動，就清掉已宣告的五行，避免下一回合畫面仍顯示「已宣告木」。
    room.players[playerIndex].zhugeBeifaElement = null;

    // 兩人制輪流行動：玩家 1 -> 玩家 2 -> 玩家 1。
    const nextIndex = playerIndex === 0 ? 1 : 0;
    // 玩家 2 在第 10 回合結束時，直接進入結算。
    if (nextIndex === 0 && room.round >= 10) {
        room.gameOver = true;
        room.currentPlayerId = null;
        const [playerOne, playerTwo] = room.players;
        room.isDraw = playerOne.score === playerTwo.score;
        if (!room.isDraw) {
            const winnerIndex = playerOne.score > playerTwo.score ? 0 : 1;
            room.winnerName = room.players[winnerIndex].name;
            room.winnerPlayerNumber = winnerIndex + 1;
        }
        room.logs.push({ time: Date.now(), text: room.isDraw ? `十回合結束，雙方以 ${playerOne.score} 分平手` : `十回合結束，${room.winnerName} 獲得勝利` });
    } else {
        // 一般情況：把操作權交給下一位玩家。
        room.currentPlayerId = room.players[nextIndex].id;
        // 只有玩家 2 結束後回到玩家 1，才代表新回合開始。
        room.logs.push({ time: Date.now(), text: `${room.players[playerIndex].name} 結束行動，輪到 ${room.players[nextIndex].name}` });

        if (nextIndex === 0) {
            Object.values(room.cities).forEach(city => {
                if (!city.ownerPlayerNumber || !city.effectId) return;
    
                const owner = room.players[city.ownerPlayerNumber - 1];
                const effect = cityEffects[city.effectId];
    
                if (owner && effect) {
                    const log = effect({ owner, city, room });
                    if (log) {
                        room.logs.push({ time: Date.now(), text: log });
                    }
                }
            });

            room.players.forEach(player => {
                if (player.passiveId !== 'xiangyu_force_per_city') return;
                const ownedCityCount = Object.values(room.cities).filter(city =>
                    city.ownerPlayerId === player.id
                ).length;
                const forceGain = ownedCityCount;
                if (forceGain > 0) {
                    player.force = (player.force || 0) + forceGain;
                    room.logs.push({
                        time: Date.now(),
                        text: `${player.name} 發動項羽被動，因擁有 ${ownedCityCount} 座城獲得 ${forceGain} 武力`
                    });
                }
            });
    
            room.round += 1;
        }
    }
    room.version += 1;
    res.json({ success: true, room: publicRoom(room, req.body.playerId) });
});

// 單機模式：取得單一城池資訊。
app.get('/api/city/:id', (req, res) => {
    const cityId = req.params.id;
    const cityData = citiesDatabase[cityId];
    
    if (cityData) {
        res.json({ success: true, data: cityData });
    } else {
        res.status(404).json({ success: false, message: "找不到該城池" });
    }
});

// 單機模式：更新單一城池資訊，例如攻城後改 owner、升級後改 defense。
app.post('/api/city/:id', (req, res) => {
    const cityId = req.params.id;
    const cityData = citiesDatabase[cityId];

    if (!cityData) {
        return res.status(404).json({ success: false, message: "找不到該城池" });
    }

    if (req.body.player !== undefined) {
        cityData.player = req.body.player;
    }

    if (req.body.action === 'attack' && cityData.effectId === 'defense_plus') {
        cityData.defense = (parseInt(cityData.defense, 10) || 0) + 2;
    }

    if (req.body.defense !== undefined) {
        cityData.defense = parseInt(req.body.defense) || cityData.defense;
    }

    res.json({ success: true, data: cityData });
});

// 單機模式：重置所有城池回初始狀態。
app.post('/api/reset-game', (req, res) => {
    citiesDatabase = JSON.parse(JSON.stringify(initialCitiesDatabase));
    res.json({ success: true, message: "遊戲已重置", data: citiesDatabase });
});

// 啟動伺服器
app.listen(PORT, '0.0.0.0', () => {
    console.log(`遊戲伺服器：http://localhost:${PORT}`);
});
