#!/bin/bash

# 1. Create all directories
mkdir -p migrations
mkdir -p src/config
mkdir -p src/db
mkdir -p src/features/admin
mkdir -p src/features/auth
mkdir -p src/features/comments
mkdir -p src/features/email
mkdir -p src/features/posts
mkdir -p src/utils
mkdir -p src/workers

# 2. Create Root Files
touch .gitignore .env package.json tsconfig.json

# 3. Create Migrations
touch migrations/1_creating_tables.sql

# 4. Create Src Root Files
touch src/app.ts src/server.ts

# 5. Create Config File
touch src/config/env.ts

# 6. Create DB Files
touch src/db/cloudinary.ts src/db/psql.ts src/db/redis.copy.ts src/db/redis.ts src/db/seed.ts

# 7. Create Features Root File
touch src/features/api.routes.ts

# 8. Create Admin Feature
touch src/features/admin/admin.controller.ts \
      src/features/admin/admin.routes.ts \
      src/features/admin/admin.service.ts \
      src/features/admin/admin.types.ts

# 9. Create Auth Feature
touch src/features/auth/auth.controller.ts \
      src/features/auth/auth.routes.ts \
      src/features/auth/auth.service.ts \
      src/features/auth/auth.tracker.ts \
      src/features/auth/auth.types.ts

# 10. Create Comments Feature
touch src/features/comments/comments.controller.ts \
      src/features/comments/comments.routes.ts \
      src/features/comments/comments.service.ts \
      src/features/comments/comments.types.ts

# 11. Create Email Feature
touch src/features/email/email.controller.ts \
      src/features/email/email.routes.ts \
      src/features/email/email.service.ts \
      src/features/email/email.types.ts

# 12. Create Posts Feature
touch src/features/posts/posts.controller.ts \
      src/features/posts/posts.routes.ts \
      src/features/posts/posts.service.ts \
      src/features/posts/posts.types.ts

# 13. Create Utils & Workers (ghost is back!)
touch src/utils/cooldown.ts
touch src/workers/ghostCleanup.ts src/workers/tokenCleanup.ts

echo "File Tree generated successfully!"
