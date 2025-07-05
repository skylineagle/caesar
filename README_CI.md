# 🏭 Air-gapped Frigate CI/CD Pipeline

Automated builds for air-gapped Frigate images with pre-fetched models.

## 🚀 Published Images

The CI/CD pipeline automatically builds and publishes air-gapped Frigate images to Docker Hub:

**Registry**: `skylineag/caesar`

### Available Tags

| Tag | Description | Use Case |
|-----|-------------|----------|
| `airgapped` | Latest stable air-gapped build | Production deployments |
| `dev-airgapped` | Latest development build | Testing new features |
| `weekly-airgapped` | Weekly scheduled builds | Ensuring fresh models |
| `{branch}-airgapped-{sha}` | Commit-specific builds | Specific version pinning |

### Quick Usage

```bash
# Pull latest stable air-gapped image
docker pull skylineag/caesar:airgapped

# Pull development version
docker pull skylineag/caesar:dev-airgapped

# Pull weekly build (fresh models)
docker pull skylineag/caesar:weekly-airgapped
```

## 🔧 Pipeline Setup

### Prerequisites

1. **Repository Secrets** (required):
   - `DOCKER_USERNAME`: Docker Hub username
   - `DOCKER_PASSWORD`: Docker Hub access token

2. **Permissions**:
   - Push access to `skylineag/caesar` repository on Docker Hub
   - GitHub Actions enabled

### Setup Instructions

1. **Configure Docker Hub Credentials**:
   ```bash
   # In GitHub repository: Settings → Secrets and variables → Actions
   # Add these secrets:
   DOCKER_USERNAME=skylineag
   DOCKER_PASSWORD=dckr_pat_xxxxxxxxxxxxx
   ```

2. **Verify Workflow File**:
   - Location: `.github/workflows/airgapped.yml`
   - Registry: `skylineag/caesar`
   - Platforms: `linux/amd64`, `linux/arm64`

## 🎯 Build Triggers

### Automatic Builds

| Trigger | When | Tag Generated |
|---------|------|---------------|
| **Push to master** | Changes to air-gapped files | `airgapped` |
| **Push to dev** | Changes to air-gapped files | `dev-airgapped` |
| **Weekly Schedule** | Sundays at 02:00 UTC | `weekly-airgapped` |

### Manual Builds

1. Go to **Actions** tab in repository
2. Select **Air-gapped Build** workflow
3. Click **Run workflow**
4. Configure:
   - Branch to build from
   - Platforms: `linux/amd64,linux/arm64`
   - Push to registry: `true`

## 📊 Build Process

### Pipeline Stages

1. **Build** (45-60 min): Multi-platform Docker build with model prefetch
2. **Test** (5-10 min): Verify models embedded and air-gapped functionality
3. **Push** (10-15 min): Upload to Docker Hub registry
4. **Notify** (1 min): Generate build summary

### Resource Usage

- **Build Time**: ~60 minutes total
- **Model Download**: ~2-3GB during build
- **Final Image Size**: ~6-8GB (with all models)
- **Platforms**: AMD64 + ARM64

## 🧪 Quality Assurance

### Automated Tests

✅ **Model Verification**: Ensures all required models are embedded
✅ **Air-gapped Test**: Verifies no network access needed at runtime
✅ **Startup Test**: Confirms Frigate can initialize with all features
✅ **Multi-platform**: Tests both AMD64 and ARM64 builds

### Test Commands

```bash
# Model count verification
docker run --rm skylineag/caesar:airgapped \
  find /config/model_cache -name "*.onnx" -o -name "*.tflite" | wc -l

# Air-gapped verification
docker run --rm --network none skylineag/caesar:airgapped \
  python3 -c "import urllib.request; urllib.request.urlopen('https://google.com')"
```

## 📈 Monitoring

### Build Status

- **GitHub Actions**: Monitor builds in Actions tab
- **Docker Hub**: Check image updates at [hub.docker.com/r/skylineag/caesar](https://hub.docker.com/r/skylineag/caesar)
- **Slack/Email**: Configure notifications as needed

### Key Metrics

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Build Success Rate | >95% | <90% |
| Build Duration | <60 min | >75 min |
| Model Download | 2-3GB | >4GB |
| Test Pass Rate | 100% | <100% |

## 🛠️ Maintenance

### Weekly Tasks
- [ ] Monitor weekly builds complete successfully
- [ ] Check Docker Hub storage usage
- [ ] Verify model sources are accessible

### Monthly Tasks
- [ ] Rotate Docker Hub access tokens
- [ ] Review build performance metrics
- [ ] Update documentation if needed

### Emergency Procedures

**Build Failures**: 
1. Check GitHub Actions logs
2. Verify Docker Hub credentials
3. Confirm model source availability

**Registry Issues**:
1. Verify Docker Hub service status
2. Check authentication tokens
3. Review push permissions

## 📝 Configuration

### Updating Registry

To change the target registry, update in `.github/workflows/airgapped.yml`:

```yaml
env:
  REGISTRY_IMAGE: your-org/your-repo  # Change this line
```

### Adding Platforms

To build for additional platforms, update the matrix:

```yaml
matrix:
  platform:
    - linux/amd64
    - linux/arm64
    - linux/arm/v7  # Add new platforms here
```

## 🔗 Related Documentation

- [Complete Air-gapped Guide](AIR_GAPPED_DEPLOYMENT.md)
- [CI/CD Setup Details](CI_SETUP.md)
- [Local Build Script](build_airgapped.sh)
- [Solution Overview](SOLUTION_SUMMARY.md)

## 🆘 Support

For pipeline issues:

1. **Check Build Logs**: GitHub Actions tab → Failed workflow → View logs
2. **Verify Secrets**: Settings → Secrets → Ensure DOCKER_* secrets exist
3. **Test Locally**: Run `./build_airgapped.sh` to reproduce issues
4. **Docker Hub Status**: Check [status.docker.com](https://status.docker.com)

The CI/CD pipeline provides reliable, automated delivery of air-gapped Frigate images with comprehensive testing and monitoring. 🚀