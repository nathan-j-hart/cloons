import requests
import json
from datetime import datetime
from typing import List, Dict, Any

def fetch_all_transactions(league_id: str, season: str = None) -> List[Dict[str, Any]]:
    """
    Fetches all transactions for a league across all weeks of the season.
    
    Args:
        league_id: The ID of the Sleeper league
        season: The season year (e.g., '2023'). If None, will use current season.
    """
    base_url = "https://api.sleeper.app/v1"
    
    if not season:
        # If no season provided, use current year
        season = str(datetime.now().year)
    
    all_transactions = []
    
    # First, get the league info to determine number of weeks
    try:
        league_url = f"{base_url}/league/{league_id}"
        league_response = requests.get(league_url)
        league_response.raise_for_status()
        league_data = league_response.json()
        
        # Get the number of weeks in the regular season
        regular_season_weeks = league_data.get('settings', {}).get('playoff_week_start', 18) - 1
        total_weeks = 18  # Standard NFL season + playoffs
        
        # Fetch transactions for each week
        for week in range(1, total_weeks + 1):
            transaction_url = f"{base_url}/league/{league_id}/transactions/{week}"
            response = requests.get(transaction_url)
            response.raise_for_status()
            weekly_transactions = response.json()
            
            if weekly_transactions:
                all_transactions.extend(weekly_transactions)
                
    except requests.exceptions.RequestException as e:
        print(f"Error fetching transactions: {e}")
        return []
    
    return all_transactions

def get_team_name(teams_data: Dict[str, Any], roster_id: int) -> str:
    """Helper function to get team name from roster ID"""
    team = teams_data.get(str(roster_id), {})
    return team.get('user_id', f"Team {roster_id}")

def get_player_name(player_id: str, players_data: Dict[str, Any]) -> str:
    """Helper function to get player name from player ID"""
    return players_data.get(player_id, {}).get('full_name', player_id)

def fetch_league_data(league_id: str) -> tuple:
    """Fetch all necessary league data (teams, players, etc.)"""
    base_url = "https://api.sleeper.app/v1"
    
    try:
        # Fetch all teams in the league
        teams_url = f"{base_url}/league/{league_id}/users"
        rosters_url = f"{base_url}/league/{league_id}/rosters"
        
        teams_response = requests.get(teams_url)
        rosters_response = requests.get(rosters_url)
        
        teams_response.raise_for_status()
        rosters_response.raise_for_status()
        
        teams_data = {}
        for roster in rosters_response.json():
            user_id = roster.get('owner_id')
            roster_id = roster.get('roster_id')
            team_name = next((user.get('metadata', {}).get('team_name') or 
                             user.get('display_name') or 
                             f"Team {roster_id}" 
                             for user in teams_response.json() 
                             if user.get('user_id') == user_id), f"Team {roster_id}")
            
            teams_data[str(roster_id)] = {
                'display_name': team_name,
                'user_id': user_id
            }
        
        # Fetch player data
        players_url = "https://api.sleeper.app/v1/players/nfl"
        players_response = requests.get(players_url)
        players_response.raise_for_status()
        players_data = players_response.json()
        
        return teams_data, players_data
        
    except Exception as e:
        print(f"Error fetching league data: {e}")
        return {}, {}

def display_trade(trade: Dict[str, Any], teams_data: Dict[str, Any], players_data: Dict[str, Any]) -> None:
    """Display a single trade in a readable format"""
    trade_id = trade.get('transaction_id', 'N/A')
    status = trade.get('status', 'completed').capitalize()
    timestamp = trade.get('created', 0) / 1000  # Convert from ms to seconds
    trade_date = datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d %H:%M:%S')
    
    print(f"\nTrade ID: {trade_id}")
    print(f"Date: {trade_date}")
    print(f"Status: {status}")
    print("-" * 60)
    
    roster_ids = trade.get('roster_ids', [])
    adds = trade.get('adds', {})
    drops = trade.get('drops', {})
    draft_picks = trade.get('draft_picks', [])
    
    # Group assets by roster
    roster_assets = {str(roster_id): {'adds': [], 'drops': [], 'picks': []} for roster_id in roster_ids}
    
    # Process player adds/drops
    for player_id, roster_id in {**adds, **drops}.items():
        roster_id = str(roster_id)
        if roster_id in roster_assets:
            if player_id in adds.values():
                roster_assets[roster_id]['adds'].append(player_id)
            if player_id in drops:
                roster_assets[roster_id]['drops'].append(player_id)
    
    # Process draft picks
    for pick in draft_picks:
        roster_id = str(pick.get('owner_id'))
        if roster_id in roster_assets:
            season = pick.get('season', 'N/A')
            round_num = pick.get('round', 'N/A')
            roster_assets[roster_id]['picks'].append(f"{season} Round {round_num}")
    
    # Display trade details for each roster
    for roster_id, assets in roster_assets.items():
        team_name = get_team_name(teams_data, int(roster_id))
        print(f"\n{team_name} receives:")
        
        if assets['adds']:
            player_names = [get_player_name(pid, players_data) for pid in assets['adds']]
            print(f"  Players: {', '.join(player_names)}")
            
        if assets['picks']:
            print(f"  Draft Picks: {', '.join(assets['picks'])}")
            
        if assets['drops']:
            player_names = [get_player_name(pid, players_data) for pid in assets['drops']]
            print(f"  Drees: {', '.join(player_names)}")
    
    print("=" * 60)

def main():
    league_id = input("Enter your Sleeper league ID: ").strip()
    if not league_id:
        print("Error: League ID cannot be empty.")
        return
    
    print(f"\nFetching trade history for league {league_id}...")
    
    # First fetch all league data
    print("Loading league data...")
    teams_data, players_data = fetch_league_data(league_id)
    
    if not teams_data:
        print("Failed to load league data. Please check your league ID and try again.")
        return
    
    # Then fetch all transactions
    print("Fetching transactions...")
    transactions = fetch_all_transactions(league_id)
    
    if not transactions:
        print("\nNo transactions found in this league's history.")
        return
    
    # Filter for only trade transactions
    trades = [t for t in transactions if t.get('type') == 'trade']
    
    if not trades:
        print("\nNo trades found in this league's history.")
        return
    
    print(f"\nFound {len(trades)} trades in league history:")
    
    # Display each trade
    for i, trade in enumerate(trades, 1):
        print(f"\nTrade {i}:")
        display_trade(trade, teams_data, players_data)

if __name__ == "__main__":
    main()