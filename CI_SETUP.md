# CI/CD Setup for Air-gapped Frigate Builds

This document explains how to set up the CI/CD pipeline for building and publishing air-gapped Frigate images.

## 🔧 Repository Setup

### Required Secrets

The air-gapped build workflow requires the following repository secrets to be configured:

1. **DOCKER_USERNAME**: Your Docker Hub username
2. **DOCKER_PASSWORD**: Your Docker Hub password or access token

#### Setting up Secrets

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add the following secrets:

| Secret Name       | Description               | Example             |
| ----------------- | ------------------------- | ------------------- |
| `DOCKER_USERNAME` | Docker Hub username       | `skylineag`         |
| `DOCKER_PASSWORD` | Docker Hub password/token | `dckr_pat_xxxxx...` |

> **💡 Tip**: Use a Docker Hub access token instead of your password for better security.

### Creating a Docker Hub Access Token

1. Log in to [Docker Hub](https://hub.docker.com/)
2. Go to **Account Settings** → **Security**
3. Click **New Access Token**
4. Give it a descriptive name (e.g., "GitHub Actions - Frigate Air-gapped")
5. Set appropriate permissions (Read & Write for the target repository)
6. Copy the token and use it as `DOCKER_PASSWORD`

## 🚀 Workflow Overview

The air-gapped build workflow (`.github/workflows/airgapped.yml`) provides:

### Triggers

- **Manual**: Via GitHub Actions UI (workflow_dispatch)
- **Automatic**: On pushes to `dev` or `master` branches when related files change
- **Scheduled**: Weekly builds on Sundays at 02:00 UTC to ensure fresh models

### Build Process

1. **Multi-platform Build**: Builds for both `linux/amd64` and `linux/arm64`
2. **Model Prefetching**: Downloads ~2-3GB of models during build
3. **Registry Push**: Pushes to `skylineag/caesar` on Docker Hub
4. **Testing**: Verifies models are embedded and air-gapped functionality works
5. **Notifications**: Provides build summaries and status updates

### Generated Tags

| Tag Pattern                | Description                    | Example                                  |
| -------------------------- | ------------------------------ | ---------------------------------------- |
| `airgapped`                | Latest stable air-gapped build | `skylineag/caesar:airgapped`             |
| `{branch}-airgapped`       | Branch-specific builds         | `skylineag/caesar:dev-airgapped`         |
| `{branch}-airgapped-{sha}` | Commit-specific builds         | `skylineag/caesar:dev-airgapped-a1b2c3d` |
| `weekly-airgapped`         | Weekly scheduled builds        | `skylineag/caesar:weekly-airgapped`      |

## 🎯 Usage

### Manual Build

1. Go to **Actions** tab in your repository
2. Select **Air-gapped Build** workflow
3. Click **Run workflow**
4. Configure options:
   - **Platforms**: Default `linux/amd64,linux/arm64`
   - **Push to registry**: Enable/disable pushing to Docker Hub

### Automatic Builds

The workflow automatically triggers when you:

- Push changes to `dev` or `master` branches
- Modify air-gapped related files:
  - `docker/main/Dockerfile.airgapped`
  - `docker/main/prefetch_models.py`
  - `build_airgapped.sh`
  - `.github/workflows/airgapped.yml`

### Scheduled Builds

- Runs every Sunday at 02:00 UTC
- Ensures models stay up-to-date
- Tagged as `weekly-airgapped`

## 📊 Build Process Details

### Build Stages

1. **Checkout**: Get source code
2. **Setup**: Configure Docker Buildx and QEMU for multi-platform builds
3. **Authentication**: Log in to Docker Hub
4. **Build**:
   - Download models (~2-3GB)
   - Build multi-platform images
   - Push by digest for efficiency
5. **Merge**: Create multi-platform manifest
6. **Test**: Verify air-gapped functionality
7. **Notify**: Create build summary

### Resource Usage

- **Build Time**: ~45-60 minutes (due to model downloads)
- **Storage**: ~20GB temporary space needed
- **Network**: ~2-3GB download during build
- **Final Image**: ~6-8GB (including all models)

### Caching

- Uses GitHub Actions cache for build layers
- Separate cache scope per platform
- Speeds up subsequent builds significantly

## 🧪 Testing

The workflow includes comprehensive testing:

### Model Verification

```bash
# Checks that required models are embedded
find /config/model_cache -name "*.onnx" -o -name "*.tflite" -o -name "*.yaml"
```

### Air-gapped Test

```bash
# Verifies no network access is required
docker run --rm --network none skylineag/caesar:airgapped python3 -c "..."
```

### Startup Test

```bash
# Tests that Frigate can start with all features enabled
docker run -d --network none -v config:/config skylineag/caesar:airgapped
```

## 🔍 Monitoring

### Build Status

Monitor builds via:

- GitHub Actions tab
- Build summaries in workflow runs
- Docker Hub repository for published images

### Logs

Key logs to check:

- Model download progress
- Docker build output
- Test results and verification
- Push status to registry

### Troubleshooting

Common issues and solutions:

| Issue                 | Cause                        | Solution                                               |
| --------------------- | ---------------------------- | ------------------------------------------------------ |
| Authentication failed | Wrong Docker Hub credentials | Update `DOCKER_USERNAME` and `DOCKER_PASSWORD` secrets |
| Build timeout         | Slow model downloads         | Increase timeout or check network                      |
| Out of space          | Large model files            | Workflow uses `maximize-build-space` action            |
| Test failures         | Models not embedded          | Check Dockerfile.airgapped and prefetch script         |

## 📈 Maintenance

### Regular Tasks

1. **Monitor weekly builds**: Ensure scheduled builds complete successfully
2. **Update secrets**: Rotate Docker Hub tokens periodically
3. **Check model sources**: Verify upstream model repositories are accessible
4. **Review build times**: Optimize if builds become too slow

### Updating Configuration

To modify the build process:

1. Edit `.github/workflows/airgapped.yml`
2. Update registry name in `REGISTRY_IMAGE` environment variable
3. Modify platform targets in build matrix
4. Adjust caching strategy if needed

### Security Considerations

- Use Docker Hub access tokens instead of passwords
- Regularly rotate authentication tokens
- Monitor access logs on Docker Hub
- Ensure secrets are properly scoped to repository

## 🆘 Support

If you encounter issues:

1. Check [GitHub Actions documentation](https://docs.github.com/en/actions)
2. Verify Docker Hub authentication
3. Review workflow logs in Actions tab
4. Check model source availability
5. Ensure adequate repository storage limits

The CI/CD pipeline provides a robust, automated way to build and distribute air-gapped Frigate images with all necessary models pre-fetched and embedded. 🚀
