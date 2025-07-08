import logging
import os
import secrets
import time
from typing import Any, Dict, List, Optional

from pocketbase import PocketBase
from pocketbase.client import ClientResponseError
from pocketbase.models import Record

logger = logging.getLogger(__name__)


class PocketBaseService:
    def __init__(
        self, url: str = None, admin_email: str = None, admin_password: str = None
    ):
        self.url = url or os.getenv("POCKETBASE_URL", "http://localhost:8090")
        self.admin_email = admin_email or os.getenv(
            "POCKETBASE_ADMIN_EMAIL", "admin@frigate.local"
        )
        self.admin_password = admin_password or os.getenv(
            "POCKETBASE_ADMIN_PASSWORD", "changeme123"
        )
        self.pb = PocketBase(self.url)
        self._authenticated = False
        self._auth_token = None
        self._last_auth_time = 0
        self._auth_timeout = 3600  # 1 hour

    def _ensure_authenticated(self):
        current_time = time.time()
        if (
            not self._authenticated
            or (current_time - self._last_auth_time) > self._auth_timeout
        ):
            try:
                self.pb.admins.auth_with_password(self.admin_email, self.admin_password)
                self._authenticated = True
                self._last_auth_time = current_time
                logger.info("Successfully authenticated with PocketBase")
            except ClientResponseError as e:
                logger.error(f"Failed to authenticate with PocketBase: {e}")
                raise

    def is_connected(self) -> bool:
        try:
            self._ensure_authenticated()
            return True
        except Exception as e:
            logger.error(f"PocketBase connection failed: {e}")
            return False

    def create_user(
        self,
        username: str,
        password: str,
        role: str = "viewer",
        active: bool = True,
        notification_tokens: List[str] = None,
    ) -> Optional[Record]:
        try:
            self._ensure_authenticated()

            user_data = {
                "username": username,
                "password": password,
                "passwordConfirm": password,
                "role": role,
                "active": active,
                "notification_tokens": notification_tokens or [],
            }

            user = self.pb.collection("users").create(user_data)
            logger.info(f"Created user in PocketBase: {username}")
            return user

        except ClientResponseError as e:
            logger.error(f"Failed to create user {username}: {e}")
            return None

    def get_user_by_username(self, username: str) -> Optional[Record]:
        try:
            self._ensure_authenticated()

            users = self.pb.collection("users").get_list(
                1, 1, {"filter": f'username = "{username}"'}
            )

            if users.items:
                return users.items[0]
            return None

        except ClientResponseError as e:
            logger.error(f"Failed to get user {username}: {e}")
            return None

    def get_user_by_id(self, user_id: str) -> Optional[Record]:
        try:
            self._ensure_authenticated()
            return self.pb.collection("users").get_one(user_id)
        except ClientResponseError as e:
            logger.error(f"Failed to get user by ID {user_id}: {e}")
            return None

    def update_user(self, user_id: str, data: Dict[str, Any]) -> Optional[Record]:
        try:
            self._ensure_authenticated()

            user = self.pb.collection("users").update(user_id, data)
            logger.info(f"Updated user in PocketBase: {user_id}")
            return user

        except ClientResponseError as e:
            logger.error(f"Failed to update user {user_id}: {e}")
            return None

    def delete_user(self, user_id: str) -> bool:
        try:
            self._ensure_authenticated()

            self.pb.collection("users").delete(user_id)
            logger.info(f"Deleted user from PocketBase: {user_id}")
            return True

        except ClientResponseError as e:
            logger.error(f"Failed to delete user {user_id}: {e}")
            return False

    def list_users(self, page: int = 1, per_page: int = 50) -> List[Record]:
        try:
            self._ensure_authenticated()

            result = self.pb.collection("users").get_list(page, per_page)
            return result.items

        except ClientResponseError as e:
            logger.error(f"Failed to list users: {e}")
            return []

    def authenticate_user(self, username: str, password: str) -> Optional[Record]:
        try:
            auth_data = self.pb.collection("users").auth_with_password(
                username, password
            )
            return auth_data.record
        except ClientResponseError as e:
            logger.error(f"Failed to authenticate user {username}: {e}")
            return None

    def update_user_password(self, user_id: str, new_password: str) -> bool:
        try:
            self._ensure_authenticated()

            data = {"password": new_password, "passwordConfirm": new_password}

            self.pb.collection("users").update(user_id, data)
            logger.info(f"Updated password for user: {user_id}")
            return True

        except ClientResponseError as e:
            logger.error(f"Failed to update password for user {user_id}: {e}")
            return False

    def migrate_user_from_sqlite(
        self,
        username: str,
        password_hash: str,
        role: str,
        notification_tokens: List[str] = None,
    ) -> Optional[Record]:
        try:
            self._ensure_authenticated()

            # Generate a temporary password for PocketBase
            temp_password = secrets.token_urlsafe(32)

            user_data = {
                "username": username,
                "password": temp_password,
                "passwordConfirm": temp_password,
                "role": role,
                "active": True,
                "legacy_password_hash": password_hash,
                "notification_tokens": notification_tokens or [],
            }

            user = self.pb.collection("users").create(user_data)
            logger.info(f"Migrated user from SQLite to PocketBase: {username}")
            return user

        except ClientResponseError as e:
            logger.error(f"Failed to migrate user {username}: {e}")
            return None

    def verify_legacy_password(self, username: str, password: str) -> bool:
        try:
            user = self.get_user_by_username(username)
            if not user or not user.legacy_password_hash:
                return False

            # Use the same password verification logic as the original Frigate
            from frigate.api.auth import verify_password

            return verify_password(password, user.legacy_password_hash)

        except Exception as e:
            logger.error(f"Failed to verify legacy password for {username}: {e}")
            return False

    def update_user_from_legacy_auth(self, username: str, password: str) -> bool:
        try:
            user = self.get_user_by_username(username)
            if not user:
                return False

            # Update the user with the new password and clear legacy hash
            data = {
                "password": password,
                "passwordConfirm": password,
                "legacy_password_hash": "",
            }

            updated_user = self.update_user(user.id, data)
            if updated_user:
                logger.info(
                    f"Updated user {username} from legacy auth to PocketBase auth"
                )
                return True

            return False

        except Exception as e:
            logger.error(f"Failed to update user from legacy auth {username}: {e}")
            return False


# Global instance
_pocketbase_service = None


def get_pocketbase_service() -> PocketBaseService:
    global _pocketbase_service
    if _pocketbase_service is None:
        _pocketbase_service = PocketBaseService()
    return _pocketbase_service
