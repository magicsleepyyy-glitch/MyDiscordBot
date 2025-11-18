# Discord Moderation Bot

A Discord moderation bot with custom role-based permissions for moderation actions.

**Command Prefix**: `p!`

## Features

- **Custom Permission System**: Assign moderation permissions to specific roles independent of Discord's native permissions
- **Moderation Commands**:
  - `p!warn @user <reason>` - Warn a user
  - `p!ban @user <reason>` - Ban a user from the server
  - `p!kick @user <reason>` - Kick a user from the server
  - `p!mute @user <reason>` - Timeout a user for 7 days
  - `p!unmute @user` - Remove timeout from a user
- **Permission Management** (Admin Only):
  - `p!grant-permission @role <WARN|BAN|KICK|MUTE>` - Grant moderation permissions to roles
  - `p!revoke-permission @role <WARN|BAN|KICK|MUTE>` - Revoke moderation permissions from roles
  - `p!list-permissions @role` - View permissions for a specific role
- **Logging**:
  - `p!modlogs [@user] [limit]` - View moderation action history
- **Help**:
  - `p!help` - Display all available commands

## Setup

1. **Create a Discord Bot**:
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Click "New Application" and give it a name
   - Go to the "Bot" section and click "Add Bot"
   - Copy the bot token
   - Go to "OAuth2" > "General" and copy the Client ID

2. **Set Environment Variables**:
   - Add `DISCORD_TOKEN` (your bot token) in the Secrets tab
   - (Optional) Add `CLIENT_ID` for the invite URL to be displayed

3. **Invite the Bot**:
   - The bot will display an invite URL when it starts
   - Or manually create one: `https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=1099780136134&scope=bot`

## Usage

### Setting Up Permissions

1. Use `p!grant-permission` to give a role permission to use moderation commands:
   ```
   p!grant-permission @Moderator WARN
   p!grant-permission @Moderator MUTE
   p!grant-permission @Admin BAN
   ```

2. Use `p!list-permissions` to view what permissions a role has:
   ```
   p!list-permissions @Moderator
   ```

### Using Moderation Commands

Once permissions are granted, users with those roles can use the commands:
```
p!warn @User Spamming in chat
p!mute @User Inappropriate behavior
p!kick @User Repeated violations
p!ban @User Severe rule violation
```

### Viewing Logs

```
p!modlogs - View recent moderation actions
p!modlogs @User - View actions taken against a specific user
p!modlogs @User 20 - View more logs for a user
```

### Getting Help

```
p!help - Display all available commands and usage
```

## Permissions

- **Administrators**: Always have all moderation permissions
- **Custom Roles**: Need to be granted specific permissions using `/grant-permission`
- **Permission Types**: WARN, BAN, KICK, MUTE

## Notes

- Mutes use Discord's timeout feature (max 7 days)
- All moderation actions are logged with unique case IDs
- Permissions and logs are stored in memory (resets on bot restart)
