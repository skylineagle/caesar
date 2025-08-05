# Camera Permissions

Frigate supports per-camera permissions that allow administrators to control which cameras each user can access. This feature provides fine-grained access control for multi-user environments.

## Overview

The camera permissions system allows:

- **Per-camera access control**: Restrict user access to specific cameras
- **Runtime permission management**: Update permissions without restarting Frigate
- **Default permissions**: All users have access to all cameras by default
- **Admin bypass**: Admin users always have access to all cameras
- **API and UI protection**: All camera data is filtered based on user permissions

## How it Works

### Permission Model

- **Admin users**: Always have access to all cameras
- **Viewer users**: Can be restricted to specific cameras
- **Default behavior**: When no specific permissions are set, users have access to all cameras
- **Permission storage**: Permissions are stored in the database and applied at runtime

### What is Restricted

When a user doesn't have permission to a camera, they cannot:

- View live streams from that camera
- Access recordings from that camera
- See events/clips from that camera
- View camera thumbnails or snapshots
- Access any API endpoints returning data from that camera
- See the camera in the configuration or dashboard

## Configuration

Camera permissions are managed through the web UI and do not require configuration file changes.

### Managing Permissions

1. **Access the Settings**: Navigate to Settings → Camera Permissions (admin only)
2. **Select a User**: Choose the viewer user you want to configure
3. **Set Permissions**: Check/uncheck cameras to grant or revoke access
4. **Apply Changes**: Use "Grant All" or "Revoke All" for bulk operations

### API Endpoints

Camera permissions can also be managed via API:

#### Get User Camera Permissions

```bash
GET /api/camera_permissions/users/{username}/cameras
```

#### Get Users with Camera Permission

```bash
GET /api/camera_permissions/cameras/{camera_name}/users
```

#### Grant Camera Permission

```bash
POST /api/camera_permissions/grant
{
  "username": "user1",
  "camera_name": "front_door"
}
```

#### Revoke Camera Permission

```bash
POST /api/camera_permissions/revoke
{
  "username": "user1",
  "camera_name": "front_door"
}
```

#### Set Multiple Permissions

```bash
POST /api/camera_permissions/set
{
  "username": "user1",
  "camera_names": ["front_door", "backyard"]
}
```

#### Get Permissions Summary

```bash
GET /api/camera_permissions/summary
```

## Implementation Details

### Database Schema

Camera permissions are stored in a `camera_permission` table with:

- `username`: The user who has permission
- `camera_name`: The camera they can access
- `created_at`: When the permission was granted

### API Security

All camera-related API endpoints automatically filter results based on user permissions:

- Events API only returns events from permitted cameras
- Media API requires camera permission to serve content
- Config API only includes permitted cameras
- Live streams check permissions before serving

### Frontend Filtering

The React frontend automatically filters:

- Camera lists in all views
- Live dashboard cameras
- Settings pages
- Navigation options

### Default Behavior

- **New users**: Automatically get access to all cameras
- **New cameras**: Existing users get access automatically
- **Missing permissions**: If no specific permissions exist, user gets access to all cameras
- **Cleanup**: Invalid permissions for non-existent cameras are automatically removed

## Migration and Compatibility

### Upgrading to Camera Permissions

When upgrading to a version with camera permissions:

1. **Existing users**: All existing users maintain access to all cameras
2. **No disruption**: The system defaults to allowing access if no permissions are set
3. **Gradual rollout**: Permissions can be configured incrementally
4. **Automatic cleanup**: Invalid permissions are cleaned up automatically

### Database Migration

The camera permissions feature includes a database migration that:

- Creates the `camera_permission` table
- Adds necessary indexes for performance
- Sets up the schema without affecting existing data

## Best Practices

### Security

- **Principle of least privilege**: Only grant access to cameras that users need
- **Regular audits**: Periodically review camera permissions
- **Admin management**: Only trusted admin users should manage permissions
- **User lifecycle**: Remove permissions when users no longer need access

### Performance

- **Permission caching**: The system caches permission checks for performance
- **Efficient queries**: Database queries are optimized for permission filtering
- **Runtime updates**: Permission changes take effect immediately

### User Experience

- **Clear feedback**: Users receive clear messages when access is denied
- **Consistent filtering**: Camera filtering is consistent across all UI components
- **Admin visibility**: Admins can easily see and manage all permissions

## Troubleshooting

### Common Issues

1. **User can't see any cameras**

   - Check if specific permissions are set
   - Verify user role (admin vs viewer)
   - Check API responses for permission data

2. **Permission changes not taking effect**

   - Permissions are applied immediately
   - Check browser cache/refresh
   - Verify API endpoints are working

3. **Database errors**
   - Ensure database migration completed
   - Check database connectivity
   - Review server logs for errors

### Debugging

Enable debug logging for camera permissions:

```yaml
logger:
  logs:
    frigate.api.camera_permissions: debug
```

This will log permission checks and help diagnose issues.

## Examples

### Scenario: Home with Multiple Users

```
Users:
- admin (admin role) → Access to all cameras
- family_member (viewer) → front_door, living_room, kitchen
- babysitter (viewer) → kids_room, living_room
- neighbor (viewer) → front_door only
```

### Scenario: Business with Departments

```
Users:
- security_admin (admin) → All cameras
- reception (viewer) → lobby, entrance
- warehouse_manager (viewer) → warehouse_1, warehouse_2, loading_dock
- office_manager (viewer) → office_1, office_2, meeting_room
```

The camera permissions system provides flexible, secure access control that scales from small home installations to large business deployments.
