const https = require('https');

const CLUB_ID = 'the-royal-file';
const OWNER_USERNAME = 'oo_arabi';
const BIN_ID = '6a5090bbf5f4af5e297b396c';
const API_KEY = '$2a$10$QQhk9bjohcodNyTgm79FG.WStnpidQ0QsU21mMt158se8850Z83Xe';
const DEFAULT_AVATAR = 'https://www.chess.com/bundles/web/images/user-image.007dad08.svg';

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'NodeJS-Race-Bot' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve({}); }
      });
    });
    req.on('error', reject);
  });
}

function updateJsonBin(payload) {
  return new Promise((resolve, reject) => {
    const dataString = JSON.stringify(payload);
    const options = {
      hostname: 'api.jsonbin.v3',
      path: `/b/${BIN_ID}`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': API_KEY,
        'Content-Length': Buffer.byteLength(dataString)
      }
    };
    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => resolve(responseData));
    });
    req.on('error', reject);
    req.write(dataString);
    req.end();
  });
}

async function run() {
  console.log("Fetching club members...");
  try {
    const clubData = await fetchJSON(`https://api.chess.com/pub/club/${CLUB_ID}/members`);
    const allMembers = [
      ...(clubData.owner ? [clubData.owner] : []),
      ...(clubData.admin || []),
      ...(clubData.weekly || []),
      ...(clubData.all_time || [])
    ];
    let uniqueUsernames = Array.from(new Set(allMembers.map(m => m.username)));
    if (!uniqueUsernames.map(u => u.toLowerCase()).includes(OWNER_USERNAME)) {
      uniqueUsernames.push(OWNER_USERNAME);
    }

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const todayStr = `${year}-${month}-${String(now.getUTCDate()).padStart(2, '0')}`;

    let leaderboardData = [];

    for (let i = 0; i < uniqueUsernames.length; i++) {
      const username = uniqueUsernames[i];
      let avatar = DEFAULT_AVATAR;
      let points = 0, wins = 0, draws = 0;
      let modePoints = { rapid: 0, blitz: 0, bullet: 0, daily: 0 };
      let modeCounts = { rapid: 0, blitz: 0, bullet: 0, daily: 0 };

      try {
        const gamesData = await fetchJSON(`https://api.chess.com/pub/player/${username}/games/${year}/${month}`);
        if (gamesData.games) {
          gamesData.games.forEach(game => {
            const gameDate = new Date(game.end_time * 1000).toISOString().split('T')[0];
            if (gameDate === todayStr && game.rated === true) {
              let isWhite = game.white.username.toLowerCase() === username.toLowerCase();
              let result = isWhite ? game.white.result : game.black.result;
              let timeClass = game.time_class || 'rapid';
              let earnedPoints = 0;

              if (result === 'win') {
                wins++;
                if (timeClass === 'rapid') earnedPoints = 15;
                else if (timeClass === 'blitz') earnedPoints = 9;
                else if (timeClass === 'bullet') earnedPoints = 3;
                else earnedPoints = 15;
                points += earnedPoints;
                if (modePoints[timeClass] !== undefined) {
                  modePoints[timeClass] += earnedPoints;
                  modeCounts[timeClass]++;
                }
              } else if (['agreed', 'stalemate', 'repetition', 'insufficient', '50move'].includes(result)) {
                draws++;
                if (timeClass === 'rapid') earnedPoints = 5;
                else if (timeClass === 'blitz') earnedPoints = 3;
                else if (timeClass === 'bullet') earnedPoints = 1;
                else earnedPoints = 5;
                points += earnedPoints;
                if (modePoints[timeClass] !== undefined) {
                  modePoints[timeClass] += earnedPoints;
                }
              }
            }
          });
        }
      } catch (e) {}

      if (points > 0) {
        try {
          const profileData = await fetchJSON(`https://api.chess.com/pub/player/${username}`);
          if (profileData.avatar) avatar = profileData.avatar;
        } catch (e) {}
      }

      if (points > 0 || username.toLowerCase() === OWNER_USERNAME) {
        let dominantMode = 'rapid';
        let maxWins = -1;
        Object.keys(modeCounts).forEach(m => {
          if (modeCounts[m] > maxWins) { maxWins = modeCounts[m]; dominantMode = m; }
        });
        leaderboardData.push({ username, points, avatar, wins, draws, modePoints, dominantMode });
      }

      await new Promise(r => setTimeout(r, 100)); // Rate limit pause
    }

    leaderboardData.sort((a, b) => b.points - a.points);
    const timestamp = Date.now();

    console.log(`Updating JSONBin with ${leaderboardData.length} players...`);
    await updateJsonBin({ leaderboard: leaderboardData, timestamp });
    console.log("Successfully updated cloud leaderboard!");
  } catch (err) {
    console.error("Error updating race system:", err);
  }
}

run();
