// This script fetches the playoff bracket for the league

async function fetchPlayoffBracket(leagueId) {
    try {
        const response = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/winners_bracket`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data.map(matchup => ({
            round: matchup.r,
            matchup_id: matchup.m,
            team_1: matchup.t1,
            team_2: matchup.t2,
            winner: matchup.w,
            loser: matchup.l
        }));
    } catch (error) {
        console.error('Error fetching playoff bracket:', error);
        throw error;
    }
}

// Example usage
fetchPlayoffBracket('1132459175851864064').then(data => console.log(data)).catch(error => console.error(error));
