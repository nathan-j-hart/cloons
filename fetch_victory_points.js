// This script fetches the current week's victory points for each team in the league

async function fetchVictoryPoints(leagueId, week) {
    const response = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`);
    const data = await response.json();
    return data.map(team => ({
        rosterId: team.roster_id,
        points: team.points
    }));
}

// Example usage
fetchVictoryPoints('1132459175851864064', 1).then(data => console.log(data));
