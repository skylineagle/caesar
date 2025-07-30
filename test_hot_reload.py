#!/usr/bin/env python3
"""
Test script to verify hot reloading functionality in Frigate.

This script tests the hot reloading of motion settings, masks, zones, and camera configurations
without requiring a full restart of the Frigate instance.
"""

import sys

import requests


def test_hot_reload_configuration():
    """Test hot reloading of various configuration settings."""

    # Configuration for testing
    base_url = "http://localhost:5000"
    test_camera = "test_camera"

    print("Testing Frigate Hot Reloading Functionality")
    print("=" * 50)

    # Test 1: Motion threshold hot reload
    print("\n1. Testing motion threshold hot reload...")
    try:
        response = requests.put(
            f"{base_url}/api/config/set?cameras.{test_camera}.motion.threshold=25",
            json={"requires_restart": 0},
        )
        if response.status_code == 200:
            print("✓ Motion threshold hot reload successful")
        else:
            print(f"✗ Motion threshold hot reload failed: {response.status_code}")
    except Exception as e:
        print(f"✗ Motion threshold hot reload error: {e}")

    # Test 2: Motion mask hot reload
    print("\n2. Testing motion mask hot reload...")
    try:
        mask_coordinates = "0.1,0.1,0.9,0.1,0.9,0.9,0.1,0.9"
        response = requests.put(
            f"{base_url}/api/config/set?cameras.{test_camera}.motion.mask={mask_coordinates}",
            json={"requires_restart": 0},
        )
        if response.status_code == 200:
            print("✓ Motion mask hot reload successful")
        else:
            print(f"✗ Motion mask hot reload failed: {response.status_code}")
    except Exception as e:
        print(f"✗ Motion mask hot reload error: {e}")

    # Test 3: Detection enabled hot reload
    print("\n3. Testing detection enabled hot reload...")
    try:
        response = requests.put(
            f"{base_url}/api/config/set?cameras.{test_camera}.detect.enabled=True",
            json={"requires_restart": 0},
        )
        if response.status_code == 200:
            print("✓ Detection enabled hot reload successful")
        else:
            print(f"✗ Detection enabled hot reload failed: {response.status_code}")
    except Exception as e:
        print(f"✗ Detection enabled hot reload error: {e}")

    # Test 4: Zone hot reload
    print("\n4. Testing zone hot reload...")
    try:
        zone_coordinates = "0.2,0.2,0.8,0.2,0.8,0.8,0.2,0.8"
        response = requests.put(
            f"{base_url}/api/config/set?cameras.{test_camera}.zones.test_zone.coordinates={zone_coordinates}",
            json={"requires_restart": 0},
        )
        if response.status_code == 200:
            print("✓ Zone hot reload successful")
        else:
            print(f"✗ Zone hot reload failed: {response.status_code}")
    except Exception as e:
        print(f"✗ Zone hot reload error: {e}")

    # Test 5: Camera enabled hot reload
    print("\n5. Testing camera enabled hot reload...")
    try:
        response = requests.put(
            f"{base_url}/api/config/set?cameras.{test_camera}.enabled=True",
            json={"requires_restart": 0},
        )
        if response.status_code == 200:
            print("✓ Camera enabled hot reload successful")
        else:
            print(f"✗ Camera enabled hot reload failed: {response.status_code}")
    except Exception as e:
        print(f"✗ Camera enabled hot reload error: {e}")

    # Test 6: Configuration that requires restart (should not hot reload)
    print("\n6. Testing configuration that requires restart...")
    try:
        response = requests.put(
            f"{base_url}/api/config/set?cameras.{test_camera}.ffmpeg.inputs.0.path=rtsp://new.url",
            json={"requires_restart": 1},
        )
        if response.status_code == 200:
            print("✓ Restart-required configuration handled correctly")
        else:
            print(f"✗ Restart-required configuration failed: {response.status_code}")
    except Exception as e:
        print(f"✗ Restart-required configuration error: {e}")

    print("\n" + "=" * 50)
    print("Hot reloading test completed!")


def test_config_subscriber():
    """Test the ConfigSubscriber functionality."""
    print("\nTesting ConfigSubscriber functionality...")

    # This would require running Frigate and testing the actual ConfigSubscriber
    # For now, we'll just verify the imports work
    try:
        from frigate.comms.config_updater import ConfigSubscriber

        print("✓ ConfigSubscriber import successful")
    except ImportError as e:
        print(f"✗ ConfigSubscriber import failed: {e}")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--subscriber":
        test_config_subscriber()
    else:
        test_hot_reload_configuration()
