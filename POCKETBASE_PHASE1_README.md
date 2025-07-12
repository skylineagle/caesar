# Phase 1: PocketBase Integration - User Management

This is Phase 1 of the dynamic permission system implementation for Frigate. In this phase, we migrate user management from SQLite to PocketBase while maintaining full backward compatibility.

## 🎯 What's Included in Phase 1

- **PocketBase Setup**: Docker Compose configuration for PocketBase
- **User Management Migration**: Move users from SQLite to PocketBase
- **Backward Compatibility**: Existing authentication continues to work
- **Dual Authentication**: Support for both PocketBase and legacy SQLite auth
- **Migration Tools**: Scripts to sync users between systems

## 🚀 Quick Start

### 1. Install Dependencies

Add PocketBase Python SDK to your requirements:

```bash
pip install pocketbase==0.21.*
```

### 2. Start PocketBase

Run the setup script to start PocketBase and configure it:

```bash
python setup_pocketbase.py
```

This will:

- Start PocketBase using Docker Compose
- Create the admin account
- Set up the users collection
- Test the connection

### 3. Migrate Existing Users

Once PocketBase is running, migrate your existing users:

```bash
python -m frigate.migrations.migrate_to_pocketbase migrate
```

### 4. Verify Migration

Check that all users were migrated successfully:

```bash
python -m frigate.migrations.migrate_to_pocketbase verify
```

## 📋 Manual Setup (Alternative)

If you prefer to set up PocketBase manually:

### 1. Start PocketBase

```bash
docker-compose -f docker-compose.pocketbase.yml up -d
```

### 2. Access PocketBase Admin

Open http://localhost:8090/\_/ and create an admin account.

### 3. Create Users Collection

Use the PocketBase admin interface to create a collection called "users" with the following schema:

```javascript
{
  "name": "users",
  "type": "auth",
  "schema": [
    {
      "name": "username",
      "type": "text",
      "required": true,
      "options": {
        "min": 3,
        "max": 30,
        "pattern": "^[A-Za-z0-9._]+$"
      }
    },
    {
      "name": "role",
      "type": "select",
      "required": true,
      "options": {
        "maxSelect": 1,
        "values": ["admin", "viewer", "custom"]
      }
    },
    {
      "name": "active",
      "type": "bool",
      "required": true
    },
    {
      "name": "legacy_password_hash",
      "type": "text",
      "required": false
    },
    {
      "name": "notification_tokens",
      "type": "json",
      "required": false
    }
  ]
}
```

## 🔧 Configuration

### Environment Variables

Set these environment variables for Frigate:

```bash
POCKETBASE_URL=http://localhost:8090
POCKETBASE_ADMIN_EMAIL=admin@frigate.local
POCKETBASE_ADMIN_PASSWORD=changeme123
```

### Docker Compose Integration

To integrate PocketBase with your existing Frigate setup, you can merge the PocketBase service into your main docker-compose.yml:

```yaml
services:
  frigate:
    # ... your existing Frigate configuration
    environment:
      - POCKETBASE_URL=http://pocketbase:8090
      - POCKETBASE_ADMIN_EMAIL=admin@frigate.local
      - POCKETBASE_ADMIN_PASSWORD=changeme123
    depends_on:
      - pocketbase

  pocketbase:
    image: ghcr.io/muchobien/pocketbase:latest
    container_name: frigate-pocketbase
    restart: unless-stopped
    ports:
      - "8090:8090"
    volumes:
      - ./pocketbase_data:/pb_data
```

## 🔄 How It Works

### Authentication Flow

1. **User Login**: When a user logs in, the system:

   - First tries PocketBase authentication
   - If user exists in PocketBase but has legacy password, verifies against legacy hash
   - Falls back to SQLite authentication for backward compatibility
   - Automatically syncs users from SQLite to PocketBase

2. **User Management**: Admin operations:
   - Create users in both PocketBase and SQLite
   - Update users in both systems
   - Delete users from both systems
   - Maintain consistency between systems

### Migration Strategy

- **Gradual Migration**: Users are migrated as they log in
- **Legacy Support**: Old password hashes are preserved during migration
- **Automatic Sync**: New users are automatically created in both systems
- **Fallback**: If PocketBase is unavailable, system falls back to SQLite

## 🛠️ Available Commands

### Migration Commands

```bash
# Migrate all users from SQLite to PocketBase
python -m frigate.migrations.migrate_to_pocketbase migrate

# Verify migration was successful
python -m frigate.migrations.migrate_to_pocketbase verify

# Sync a specific user
python -m frigate.migrations.migrate_to_pocketbase sync <username>
```

### PocketBase Management

```bash
# Start PocketBase
docker-compose -f docker-compose.pocketbase.yml up -d

# Stop PocketBase
docker-compose -f docker-compose.pocketbase.yml down

# View PocketBase logs
docker-compose -f docker-compose.pocketbase.yml logs -f pocketbase
```

## 📊 What's Different for Users

### For End Users

- **No Changes**: Login process remains exactly the same
- **Same UI**: User management interface looks identical
- **Same Permissions**: All existing roles and permissions work as before

### For Administrators

- **Enhanced Management**: Can manage users through PocketBase admin interface
- **Better Monitoring**: PocketBase provides detailed user activity logs
- **Improved Security**: Modern authentication system with better password handling

## 🔍 Troubleshooting

### PocketBase Not Starting

```bash
# Check if port 8090 is available
netstat -tulpn | grep 8090

# Check Docker logs
docker-compose -f docker-compose.pocketbase.yml logs pocketbase
```

### Migration Issues

```bash
# Check PocketBase connection
python -c "from frigate.services.pocketbase_service import get_pocketbase_service; print(get_pocketbase_service().is_connected())"

# Re-run migration with verbose logging
python -m frigate.migrations.migrate_to_pocketbase migrate --verbose
```

### Authentication Problems

1. **Check PocketBase Status**: Ensure PocketBase is running
2. **Verify Environment Variables**: Confirm POCKETBASE\_\* variables are set
3. **Check Logs**: Look at Frigate logs for authentication errors
4. **Fallback**: System should fall back to SQLite if PocketBase is unavailable

## 🚀 Next Steps

After Phase 1 is complete, you'll be ready for:

- **Phase 2**: Camera-specific permissions
- **Phase 3**: Feature-based permissions
- **Phase 4**: Role templates and bulk management
- **Phase 5**: Advanced features and optimizations

## 📝 Files Modified/Added

### New Files

- `docker-compose.pocketbase.yml` - PocketBase Docker configuration
- `frigate/services/pocketbase_service.py` - PocketBase service layer
- `frigate/migrations/migrate_to_pocketbase.py` - Migration utilities
- `setup_pocketbase.py` - Setup script
- `pocketbase_migrations/001_initial_schema.js` - Database schema

### Modified Files

- `docker/main/requirements-wheels.txt` - Added PocketBase dependency
- `frigate/api/auth.py` - Updated authentication endpoints

## 🔒 Security Considerations

- **Password Migration**: Legacy passwords are preserved during migration
- **Dual Authentication**: Both systems must be kept in sync
- **Access Control**: PocketBase admin interface should be secured
- **Environment Variables**: Store credentials securely

## 🎉 Success Criteria

Phase 1 is complete when:

- [ ] PocketBase is running and accessible
- [ ] Users collection is created with proper schema
- [ ] Existing users can log in without issues
- [ ] New users are created in both systems
- [ ] User management UI works identically
- [ ] Migration script runs successfully
- [ ] Backward compatibility is maintained

---

**Ready for Phase 2?** Once Phase 1 is stable, we'll add camera-specific permissions!
