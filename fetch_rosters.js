// This script fetches the rosters for the league

async function fetchRosters(leagueId) {
    try {
        const response = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data.map(roster => ({
            roster_id: roster.roster_id,
            owner_id: roster.owner_id
        }));
    } catch (error) {
        console.error('Error fetching rosters:', error);
        throw error;
    }
}

// Example usage
fetchRosters('1132459175851864064').then(data => console.log(data)).catch(error => console.error(error));
