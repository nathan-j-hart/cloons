// This script fetches the playoff bracket for the league

async function fetchPlayoffBracket(leagueId) {
    const response = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/winners_bracket`);
    const data = await response.json();
    return data.map(matchup => ({
        matchup_id: matchup.matchup_id,
        team_1: {
            roster_id: matchup.team_1.roster_id,
            points: matchup.team_1.points
        },
        team_2: {
            roster_id: matchup.team_2.roster_id,
            points: matchup.team_2.points
        }
    }));
}

// Example usage
fetchPlayoffBracket('1132459175851864064').then(data => console.log(data));
