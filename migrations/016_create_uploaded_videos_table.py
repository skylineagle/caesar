"""Peewee migrations -- 016_create_uploaded_videos_table.py.

This migration was already applied to create the uploaded videos table.
Since it was already run, this is a placeholder to satisfy the migration system.

"""

import peewee as pw

SQL = pw.SQL


def migrate(migrator, database, fake=False, **kwargs):
    # This migration was already applied - no-op placeholder
    pass


def rollback(migrator, database, fake=False, **kwargs):
    # This migration was already applied - no-op placeholder
    pass
