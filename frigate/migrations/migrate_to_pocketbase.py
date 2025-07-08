#!/usr/bin/env python3

import logging
import sys

from peewee import DoesNotExist

from frigate.models import User
from frigate.services.pocketbase_service import get_pocketbase_service

logger = logging.getLogger(__name__)


def migrate_users_to_pocketbase():
    """
    Migrate existing users from SQLite to PocketBase
    """
    pb_service = get_pocketbase_service()

    # Check PocketBase connection
    if not pb_service.is_connected():
        logger.error("Cannot connect to PocketBase. Please ensure it's running.")
        return False

    try:
        # Get all users from SQLite
        sqlite_users = User.select()
        migrated_count = 0
        error_count = 0

        for user in sqlite_users:
            try:
                # Check if user already exists in PocketBase
                existing_user = pb_service.get_user_by_username(user.username)

                if existing_user:
                    logger.info(
                        f"User {user.username} already exists in PocketBase, skipping..."
                    )
                    continue

                # Migrate user to PocketBase
                pb_user = pb_service.migrate_user_from_sqlite(
                    username=user.username,
                    password_hash=user.password_hash,
                    role=user.role,
                    notification_tokens=user.notification_tokens or [],
                )

                if pb_user:
                    migrated_count += 1
                    logger.info(f"Successfully migrated user: {user.username}")
                else:
                    error_count += 1
                    logger.error(f"Failed to migrate user: {user.username}")

            except Exception as e:
                error_count += 1
                logger.error(f"Error migrating user {user.username}: {e}")

        logger.info(
            f"Migration completed: {migrated_count} users migrated, {error_count} errors"
        )
        return error_count == 0

    except Exception as e:
        logger.error(f"Failed to migrate users: {e}")
        return False


def sync_user_from_sqlite_to_pocketbase(username: str):
    """
    Sync a specific user from SQLite to PocketBase
    """
    pb_service = get_pocketbase_service()

    if not pb_service.is_connected():
        logger.error("Cannot connect to PocketBase")
        return False

    try:
        # Get user from SQLite
        sqlite_user = User.get_by_id(username)

        # Check if user exists in PocketBase
        pb_user = pb_service.get_user_by_username(username)

        if pb_user:
            # Update existing user
            data = {
                "role": sqlite_user.role,
                "notification_tokens": sqlite_user.notification_tokens or [],
            }

            updated_user = pb_service.update_user(pb_user.id, data)
            if updated_user:
                logger.info(f"Updated user {username} in PocketBase")
                return True
            else:
                logger.error(f"Failed to update user {username} in PocketBase")
                return False
        else:
            # Create new user
            pb_user = pb_service.migrate_user_from_sqlite(
                username=sqlite_user.username,
                password_hash=sqlite_user.password_hash,
                role=sqlite_user.role,
                notification_tokens=sqlite_user.notification_tokens or [],
            )

            if pb_user:
                logger.info(f"Created user {username} in PocketBase")
                return True
            else:
                logger.error(f"Failed to create user {username} in PocketBase")
                return False

    except DoesNotExist:
        logger.error(f"User {username} not found in SQLite")
        return False
    except Exception as e:
        logger.error(f"Error syncing user {username}: {e}")
        return False


def sync_user_from_pocketbase_to_sqlite(username: str):
    """
    Sync a user from PocketBase back to SQLite (for backward compatibility)
    """
    pb_service = get_pocketbase_service()

    if not pb_service.is_connected():
        logger.error("Cannot connect to PocketBase")
        return False

    try:
        # Get user from PocketBase
        pb_user = pb_service.get_user_by_username(username)

        if not pb_user:
            logger.error(f"User {username} not found in PocketBase")
            return False

        # Update or create user in SQLite
        try:
            sqlite_user = User.get_by_id(username)
            # Update existing user
            sqlite_user.role = pb_user.role
            sqlite_user.notification_tokens = pb_user.notification_tokens or []
            sqlite_user.save()
            logger.info(f"Updated user {username} in SQLite")

        except DoesNotExist:
            # Create new user in SQLite
            # Note: We can't sync password back for security reasons
            User.create(
                username=username,
                role=pb_user.role,
                password_hash="",  # Empty hash - will require password reset
                notification_tokens=pb_user.notification_tokens or [],
            )
            logger.info(f"Created user {username} in SQLite")

        return True

    except Exception as e:
        logger.error(f"Error syncing user {username} from PocketBase: {e}")
        return False


def verify_migration():
    """
    Verify that all users have been properly migrated
    """
    pb_service = get_pocketbase_service()

    if not pb_service.is_connected():
        logger.error("Cannot connect to PocketBase")
        return False

    try:
        # Get all users from both systems
        sqlite_users = {user.username: user for user in User.select()}
        pb_users = {user.username: user for user in pb_service.list_users()}

        # Check for missing users
        missing_in_pb = set(sqlite_users.keys()) - set(pb_users.keys())
        missing_in_sqlite = set(pb_users.keys()) - set(sqlite_users.keys())

        if missing_in_pb:
            logger.warning(f"Users missing in PocketBase: {missing_in_pb}")

        if missing_in_sqlite:
            logger.warning(f"Users missing in SQLite: {missing_in_sqlite}")

        # Check for role mismatches
        for username in sqlite_users.keys() & pb_users.keys():
            sqlite_role = sqlite_users[username].role
            pb_role = pb_users[username].role

            if sqlite_role != pb_role:
                logger.warning(
                    f"Role mismatch for {username}: SQLite={sqlite_role}, PocketBase={pb_role}"
                )

        logger.info("Migration verification completed")
        return len(missing_in_pb) == 0 and len(missing_in_sqlite) == 0

    except Exception as e:
        logger.error(f"Error verifying migration: {e}")
        return False


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    if len(sys.argv) > 1:
        command = sys.argv[1]

        if command == "migrate":
            success = migrate_users_to_pocketbase()
            sys.exit(0 if success else 1)
        elif command == "verify":
            success = verify_migration()
            sys.exit(0 if success else 1)
        elif command == "sync" and len(sys.argv) > 2:
            username = sys.argv[2]
            success = sync_user_from_sqlite_to_pocketbase(username)
            sys.exit(0 if success else 1)
        else:
            print(
                "Usage: python migrate_to_pocketbase.py [migrate|verify|sync <username>]"
            )
            sys.exit(1)
    else:
        print("Usage: python migrate_to_pocketbase.py [migrate|verify|sync <username>]")
        sys.exit(1)
