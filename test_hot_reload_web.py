#!/usr/bin/env python3
"""
Test script to verify web interface hot reloading functionality.

This script tests that the web interface correctly handles hot-reloadable configurations
without showing restart required messages.
"""

import requests


def test_web_hot_reload():
    """Test that web interface hot reloading works correctly."""

    base_url = "http://localhost:5000"
    test_camera = "test_camera"

    print("Testing Web Interface Hot Reloading")
    print("=" * 50)

    # Test 1: Motion threshold (should be hot-reloadable)
    print("\n1. Testing motion threshold hot reload...")
    try:
        response = requests.put(
            f"{base_url}/api/config/set?cameras.{test_camera}.motion.threshold=25",
            json={"requires_restart": 0},
        )
        if response.status_code == 200:
            data = response.json()
            if "Config successfully updated and applied" in data.get("message", ""):
                print("✓ Motion threshold hot reload successful - no restart required")
            else:
                print(f"✗ Motion threshold response: {data.get('message', '')}")
        else:
            print(f"✗ Motion threshold hot reload failed: {response.status_code}")
    except Exception as e:
        print(f"✗ Motion threshold hot reload error: {e}")

    # Test 2: Motion mask (should be hot-reloadable)
    print("\n2. Testing motion mask hot reload...")
    try:
        mask_coordinates = "0.1,0.1,0.9,0.1,0.9,0.9,0.1,0.9"
        response = requests.put(
            f"{base_url}/api/config/set?cameras.{test_camera}.motion.mask={mask_coordinates}",
            json={"requires_restart": 0},
        )
        if response.status_code == 200:
            data = response.json()
            if "Config successfully updated and applied" in data.get("message", ""):
                print("✓ Motion mask hot reload successful - no restart required")
            else:
                print(f"✗ Motion mask response: {data.get('message', '')}")
        else:
            print(f"✗ Motion mask hot reload failed: {response.status_code}")
    except Exception as e:
        print(f"✗ Motion mask hot reload error: {e}")

    # Test 3: Zone (should be hot-reloadable)
    print("\n3. Testing zone hot reload...")
    try:
        zone_coordinates = "0.2,0.2,0.8,0.2,0.8,0.8,0.2,0.8"
        response = requests.put(
            f"{base_url}/api/config/set?cameras.{test_camera}.zones.test_zone.coordinates={zone_coordinates}",
            json={"requires_restart": 0},
        )
        if response.status_code == 200:
            data = response.json()
            if "Config successfully updated and applied" in data.get("message", ""):
                print("✓ Zone hot reload successful - no restart required")
            else:
                print(f"✗ Zone response: {data.get('message', '')}")
        else:
            print(f"✗ Zone hot reload failed: {response.status_code}")
    except Exception as e:
        print(f"✗ Zone hot reload error: {e}")

    # Test 4: Camera stream URL (should require restart)
    print("\n4. Testing camera stream URL (should require restart)...")
    try:
        response = requests.put(
            f"{base_url}/api/config/set?cameras.{test_camera}.ffmpeg.inputs.0.path=rtsp://new.url",
            json={"requires_restart": 1},
        )
        if response.status_code == 200:
            data = response.json()
            if "restart to apply" in data.get("message", ""):
                print("✓ Camera stream URL correctly requires restart")
            else:
                print(f"✗ Camera stream URL response: {data.get('message', '')}")
        else:
            print(f"✗ Camera stream URL test failed: {response.status_code}")
    except Exception as e:
        print(f"✗ Camera stream URL test error: {e}")

    # Test 5: Automatic hot reload detection
    print("\n5. Testing automatic hot reload detection...")
    try:
        response = requests.put(
            f"{base_url}/api/config/set?cameras.{test_camera}.motion.threshold=30",
            json={
                "requires_restart": 1
            },  # Explicitly set to 1, but should be auto-detected as hot-reloadable
        )
        if response.status_code == 200:
            data = response.json()
            if "Config successfully updated and applied" in data.get("message", ""):
                print("✓ Automatic hot reload detection working")
            else:
                print(f"✗ Automatic detection response: {data.get('message', '')}")
        else:
            print(f"✗ Automatic detection failed: {response.status_code}")
    except Exception as e:
        print(f"✗ Automatic detection error: {e}")

    print("\n" + "=" * 50)
    print("Web interface hot reloading test completed!")


if __name__ == "__main__":
    test_web_hot_reload()
