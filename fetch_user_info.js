// This script fetches user information for the league

async function fetchUserInfo(leagueId) {
    try {
        const response = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data.map(user => ({
            user_id: user.user_id,
            display_name: user.display_name,
            avatar: user.metadata.avatar ? user.metadata.avatar : 'https://play-lh.googleusercontent.com/o1GxLz2vjSSwEMEaqWcqBESsJm2cfgSywh_f0zrXwq5v--n9zm95TzUebjv-j3WZQ2A'
        }));
    } catch (error) {
        console.error('Error fetching user information:', error);
        throw error;
    }
}

// Example usage
fetchUserInfo('1132459175851864064').then(data => console.log(data)).catch(error => console.error(error));
