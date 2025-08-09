"""Peewee migrations -- 031_fix_user_role_column.py.

This migration was already applied but the file was missing.
Creating a placeholder file to satisfy the migration system.

"""

import peewee as pw

SQL = pw.SQL


def migrate(migrator, database, fake=False, **kwargs):
    # This migration was already applied, so this is a no-op
    pass


def rollback(migrator, database, fake=False, **kwargs):
    # No rollback needed for placeholder migration
    pass
