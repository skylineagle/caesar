"""Peewee migrations -- 032_create_camera_permissions_table.py.

Some examples (model - class or model name)::

    > Model = migrator.orm['model_name']            # Return model in current state by name

    > migrator.sql(sql)                             # Run custom SQL
    > migrator.python(func, *args, **kwargs)        # Run python code
    > migrator.create_model(Model)                  # Create a model (could be used as decorator)
    > migrator.remove_model(model, cascade=True)    # Remove a model
    > migrator.add_fields(model, **fields)          # Add fields to a model
    > migrator.change_fields(model, **fields)       # Change fields
    > migrator.remove_fields(model, *field_names, cascade=True)
    > migrator.rename_field(model, old_field_name, new_field_name)
    > migrator.rename_table(model, new_table_name)
    > migrator.add_index(model, *col_names, unique=False)
    > migrator.drop_index(model, *col_names)
    > migrator.add_not_null(model, *field_names)
    > migrator.drop_not_null(model, *field_names)
    > migrator.add_default(model, field_name, default)

"""

import peewee as pw

SQL = pw.SQL


def migrate(migrator, database, fake=False, **kwargs):
    migrator.sql(
        'CREATE TABLE IF NOT EXISTS "camera_permission" ("id" INTEGER NOT NULL PRIMARY KEY, "username" VARCHAR(30) NOT NULL, "camera_name" VARCHAR(20) NOT NULL, "created_at" DATETIME NOT NULL)'
    )
    migrator.sql(
        'CREATE UNIQUE INDEX IF NOT EXISTS "camera_permission_username_camera" ON "camera_permission" ("username", "camera_name")'
    )
    migrator.sql(
        'CREATE INDEX IF NOT EXISTS "camera_permission_username" ON "camera_permission" ("username")'
    )
    migrator.sql(
        'CREATE INDEX IF NOT EXISTS "camera_permission_camera_name" ON "camera_permission" ("camera_name")'
    )


def rollback(migrator, database, fake=False, **kwargs):
    migrator.sql('DROP TABLE IF EXISTS "camera_permission"')
