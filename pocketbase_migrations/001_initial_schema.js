migrate(
  (db) => {
    const collection = new Collection({
      id: "users",
      created: "2024-01-01 00:00:00.000Z",
      updated: "2024-01-01 00:00:00.000Z",
      name: "users",
      type: "auth",
      system: false,
      schema: [
        {
          system: false,
          id: "username",
          name: "username",
          type: "text",
          required: true,
          unique: true,
          options: {
            min: 3,
            max: 30,
            pattern: "^[A-Za-z0-9._]+$",
          },
        },
        {
          system: false,
          id: "role",
          name: "role",
          type: "select",
          required: true,
          options: {
            maxSelect: 1,
            values: ["admin", "viewer", "custom"],
          },
        },
        {
          system: false,
          id: "active",
          name: "active",
          type: "bool",
          required: true,
          options: {},
        },
        {
          system: false,
          id: "legacy_password_hash",
          name: "legacy_password_hash",
          type: "text",
          required: false,
          options: {
            min: 0,
            max: 255,
          },
        },
        {
          system: false,
          id: "notification_tokens",
          name: "notification_tokens",
          type: "json",
          required: false,
          options: {},
        },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_users_username` ON `users` (`username`)",
      ],
      listRule: "@request.auth.role = 'admin'",
      viewRule: "@request.auth.id = id || @request.auth.role = 'admin'",
      createRule: "@request.auth.role = 'admin'",
      updateRule: "@request.auth.id = id || @request.auth.role = 'admin'",
      deleteRule: "@request.auth.role = 'admin' && username != 'admin'",
      options: {
        allowEmailAuth: false,
        allowOAuth2Auth: false,
        allowUsernameAuth: true,
        exceptEmailDomains: null,
        manageRule: "@request.auth.role = 'admin'",
        minPasswordLength: 6,
        onlyEmailDomains: null,
        requireEmail: false,
      },
    });

    return Dao(db).saveCollection(collection);
  },
  (db) => {
    const dao = new Dao(db);
    const collection = dao.findCollectionByNameOrId("users");

    return dao.deleteCollection(collection);
  }
);
